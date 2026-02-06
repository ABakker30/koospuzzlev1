// src/engines/engineGPU/shaders/solver.wgsl
// WebGPU compute shader for parallel backtracking puzzle solver
// Based on the Puzzle Processor architecture: compiled search as program

// ============================================================================
// Constants (will be specialized per puzzle via pipeline constants)
// ============================================================================

override CELLS_LANE_COUNT: u32 = 2u;      // ceil(numCells / 64)
override NUM_CELLS: u32 = 100u;
override NUM_PIECES: u32 = 25u;
override MAX_DEPTH: u32 = 25u;
override BUDGET: u32 = 100000u;           // Fit-tests before checkpoint

// Thread status values
const STATUS_RUNNING: u32 = 0u;
const STATUS_EXHAUSTED: u32 = 1u;
const STATUS_SOLUTION: u32 = 2u;
const STATUS_BUDGET: u32 = 3u;

// ============================================================================
// Data Structures
// ============================================================================

// Embedding: a valid placement of a piece
struct Embedding {
  cells_mask_0: u64,      // First 64 cells
  cells_mask_1: u64,      // Next 64 cells (if needed)
  piece_bit: u32,         // Which piece this uses
  min_cell: u32,          // Minimum cell index (for bucket)
}

// Bucket: offset and count into embedding array for a cell
struct Bucket {
  offset: u32,
  count: u32,
}

// Checkpoint: complete search state for a thread
struct Checkpoint {
  cells_mask_0: u64,
  cells_mask_1: u64,
  pieces_mask: u32,
  depth: u32,
  status: u32,
  fit_tests: u32,
  nodes: u32,
  _pad: u32,
  // Per-depth state (iter position)
  iter: array<u32, 25>,
  // Per-depth state (choice made)
  choice: array<u32, 25>,
}

// Solution output
struct Solution {
  valid: u32,
  depth: u32,
  choices: array<u32, 25>,
}

// Global statistics
struct Stats {
  solutions_found: atomic<u32>,
  total_fit_tests: atomic<u32>,
  total_nodes: atomic<u32>,
  threads_exhausted: atomic<u32>,
  threads_budget: atomic<u32>,
}

// Depth histogram - counts how many threads reached each depth
struct DepthHistogram {
  counts: array<atomic<u32>, 32>,
}

// ============================================================================
// Bindings
// ============================================================================

@group(0) @binding(0) var<storage, read> embeddings: array<Embedding>;
@group(0) @binding(1) var<storage, read> buckets: array<Bucket>;
@group(0) @binding(2) var<storage, read_write> checkpoints: array<Checkpoint>;
@group(0) @binding(3) var<storage, read_write> solutions: array<Solution>;
@group(0) @binding(4) var<storage, read_write> stats: Stats;
@group(0) @binding(5) var<storage, read_write> depth_histogram: DepthHistogram;

// ============================================================================
// Helper Functions
// ============================================================================

// Test if bit is set in cells mask
fn test_cell_bit(mask0: u64, mask1: u64, idx: u32) -> bool {
  if (idx < 64u) {
    return (mask0 & (1lu << idx)) != 0lu;
  } else {
    return (mask1 & (1lu << (idx - 64u))) != 0lu;
  }
}

// Find first set bit (lowest open cell)
fn find_first_set_bit(mask0: u64, mask1: u64) -> i32 {
  if (mask0 != 0lu) {
    return i32(firstTrailingBit(mask0));
  }
  if (mask1 != 0lu) {
    return 64 + i32(firstTrailingBit(mask1));
  }
  return -1;
}

// Check if embedding fits: (cells & emb) == emb
fn embedding_fits(
  cells0: u64, cells1: u64,
  emb0: u64, emb1: u64
) -> bool {
  return ((cells0 & emb0) == emb0) && ((cells1 & emb1) == emb1);
}

// Count set bits (popcount)
fn popcount64(x: u64) -> u32 {
  return countOneBits(x);
}

// ============================================================================
// Main Solver Kernel
// ============================================================================

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let thread_id = global_id.x;
  
  // Bounds check
  if (thread_id >= arrayLength(&checkpoints)) {
    return;
  }
  
  // Load checkpoint
  var cp = checkpoints[thread_id];
  
  // Skip if already finished
  if (cp.status == STATUS_EXHAUSTED || cp.status == STATUS_SOLUTION) {
    return;
  }
  
  // Local state
  var cells0 = cp.cells_mask_0;
  var cells1 = cp.cells_mask_1;
  var pieces = cp.pieces_mask;
  var depth = cp.depth;
  var fit_tests = cp.fit_tests;
  var nodes = cp.nodes;
  var budget_remaining = BUDGET;
  
  // Stack for iterators
  var iter_stack: array<u32, 25>;
  for (var i = 0u; i < MAX_DEPTH; i++) {
    iter_stack[i] = cp.iter[i];
  }
  
  var choice_stack: array<u32, 25>;
  for (var i = 0u; i < MAX_DEPTH; i++) {
    choice_stack[i] = cp.choice[i];
  }
  
  // Main search loop
  loop {
    // Budget exhausted?
    if (budget_remaining == 0u) {
      // Save checkpoint
      cp.cells_mask_0 = cells0;
      cp.cells_mask_1 = cells1;
      cp.pieces_mask = pieces;
      cp.depth = depth;
      cp.status = STATUS_BUDGET;
      cp.fit_tests = fit_tests;
      cp.nodes = nodes;
      for (var i = 0u; i < MAX_DEPTH; i++) {
        cp.iter[i] = iter_stack[i];
        cp.choice[i] = choice_stack[i];
      }
      checkpoints[thread_id] = cp;
      atomicAdd(&stats.threads_budget, 1u);
      atomicAdd(&stats.total_fit_tests, fit_tests);
      atomicAdd(&stats.total_nodes, nodes);
      // Track max depth reached by this thread
      atomicAdd(&depth_histogram.counts[min(depth, 31u)], 1u);
      return;
    }
    
    // Find next cell to cover
    let target_cell = find_first_set_bit(cells0, cells1);
    
    // All cells covered = solution found!
    if (target_cell < 0) {
      // Record solution
      let sol_idx = atomicAdd(&stats.solutions_found, 1u);
      if (sol_idx < arrayLength(&solutions)) {
        var sol: Solution;
        sol.valid = 1u;
        sol.depth = depth;
        for (var i = 0u; i < MAX_DEPTH; i++) {
          sol.choices[i] = choice_stack[i];
        }
        solutions[sol_idx] = sol;
      }
      
      // Backtrack to find more solutions
      if (depth == 0u) {
        cp.status = STATUS_EXHAUSTED;
        cp.fit_tests = fit_tests;
        cp.nodes = nodes;
        checkpoints[thread_id] = cp;
        atomicAdd(&stats.threads_exhausted, 1u);
        atomicAdd(&stats.total_fit_tests, fit_tests);
        atomicAdd(&stats.total_nodes, nodes);
        // Track that this thread found a solution at full depth
        atomicAdd(&depth_histogram.counts[min(depth, 31u)], 1u);
        return;
      }
      
      // Undo last placement and continue
      depth--;
      let last_choice = choice_stack[depth];
      let last_emb = embeddings[last_choice];
      cells0 ^= last_emb.cells_mask_0;
      cells1 ^= last_emb.cells_mask_1;
      pieces ^= (1u << last_emb.piece_bit);
      iter_stack[depth]++;
      continue;
    }
    
    // Get bucket for this cell
    let bucket = buckets[u32(target_cell)];
    var iter = iter_stack[depth];
    
    // Search for valid embedding in this bucket
    var found = false;
    while (iter < bucket.count) {
      budget_remaining--;
      fit_tests++;
      
      let emb_idx = bucket.offset + iter;
      let emb = embeddings[emb_idx];
      
      // Check piece available
      if ((pieces & (1u << emb.piece_bit)) == 0u) {
        iter++;
        continue;
      }
      
      // Check cells available (embedding fits)
      if (!embedding_fits(cells0, cells1, emb.cells_mask_0, emb.cells_mask_1)) {
        iter++;
        continue;
      }
      
      // Found valid embedding - apply it
      cells0 ^= emb.cells_mask_0;
      cells1 ^= emb.cells_mask_1;
      pieces ^= (1u << emb.piece_bit);
      
      // Record choice
      choice_stack[depth] = emb_idx;
      iter_stack[depth] = iter;
      
      // Move to next depth
      depth++;
      nodes++;
      iter_stack[depth] = 0u;
      
      found = true;
      break;
    }
    
    if (!found) {
      // No valid embedding - backtrack
      if (depth == 0u) {
        // Exhausted all possibilities
        cp.status = STATUS_EXHAUSTED;
        cp.fit_tests = fit_tests;
        cp.nodes = nodes;
        checkpoints[thread_id] = cp;
        atomicAdd(&stats.threads_exhausted, 1u);
        atomicAdd(&stats.total_fit_tests, fit_tests);
        atomicAdd(&stats.total_nodes, nodes);
        // Track max depth this thread reached before exhausting
        atomicAdd(&depth_histogram.counts[min(depth, 31u)], 1u);
        return;
      }
      
      // Undo last placement
      depth--;
      let last_choice = choice_stack[depth];
      let last_emb = embeddings[last_choice];
      cells0 ^= last_emb.cells_mask_0;
      cells1 ^= last_emb.cells_mask_1;
      pieces ^= (1u << last_emb.piece_bit);
      iter_stack[depth]++;
    }
  }
}
