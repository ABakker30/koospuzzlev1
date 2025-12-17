import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import SceneCanvas from '../../components/SceneCanvas';
import { AutoSolveSlidersPanel } from '../solve/components/AutoSolveSlidersPanel';
import { SolutionInfoModal } from './SolutionInfoModal';
import { PresetSelectorModal } from '../../components/PresetSelectorModal';
import { ENVIRONMENT_PRESETS } from '../../constants/environmentPresets';
import { getPuzzleSolution, type PuzzleSolutionRecord } from '../../api/solutions';
import { computeViewTransforms, type ViewTransforms } from '../../services/ViewTransforms';
import { ijkToXyz } from '../../lib/ijk';
import { quickHullWithCoplanarMerge } from '../../lib/quickhull-adapter';
import { DEFAULT_STUDIO_SETTINGS, type StudioSettings } from '../../types/studio';
import { supabase } from '../../lib/supabase';
import type { IJK } from '../../types/shape';
import type { PlacedPiece } from '../solve/types/manualSolve';
import { PieceViewerModal } from './PieceViewerModal';

// Bright settings for analysis view
const ANALYSIS_SETTINGS: StudioSettings = {
  ...DEFAULT_STUDIO_SETTINGS,
  lights: {
    ...DEFAULT_STUDIO_SETTINGS.lights,
    brightness: 2.7,  // Much brighter for analysis
  }
};

// FCC transformation matrix
const T_ijk_to_xyz = [
  [0.5, 0.5, 0, 0],
  [0.5, 0, 0.5, 0],  
  [0, 0.5, 0.5, 0],
  [0, 0, 0, 1]
];

export const SolutionsPage: React.FC = () => {
  const { puzzleId } = useParams<{ puzzleId: string }>();
  const navigate = useNavigate();
  
  const [solution, setSolution] = useState<PuzzleSolutionRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [cells, setCells] = useState<IJK[]>([]);
  const [view, setView] = useState<ViewTransforms | null>(null);
  const [placedPieces, setPlacedPieces] = useState<PlacedPiece[]>([]);
  const [currentPreset, setCurrentPreset] = useState<string>(() => {
    try {
      return localStorage.getItem('solutions.environmentPreset') || '';
    } catch {
      return '';
    }
  });
  const [envSettings, setEnvSettings] = useState<StudioSettings>(() => {
    try {
      const presetKey = localStorage.getItem('solutions.environmentPreset');
      if (presetKey && ENVIRONMENT_PRESETS[presetKey]) {
        return ENVIRONMENT_PRESETS[presetKey];
      }
    } catch {
      // ignore
    }
    return ANALYSIS_SETTINGS;
  });
  const [showPresetModal, setShowPresetModal] = useState(false);
  const [puzzleStats, setPuzzleStats] = useState<{
    cellCount: number;
    createdAt: string;
    creatorName: string;
    totalSolutions: number;
    autoSolveCount: number;
    manualSolveCount: number;
    gamesPlayed: number;
  } | null>(null);
  
  const [revealK, setRevealK] = useState(0);  // Start at 0 like movie pages
  const [revealMax, setRevealMax] = useState(0);  // Start at 0 to show all initially
  const [revealMethod, setRevealMethod] = useState<'global' | 'connected' | 'supported'>('global'); // global = lowest Y everywhere, connected = grow from lowest, supported = most supported ground-up
  const [explosionFactor, setExplosionFactor] = useState(0);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [selectedPieceUid, setSelectedPieceUid] = useState<string | null>(null);
  const [showPieceModal, setShowPieceModal] = useState(false);

  // Load solution data from Supabase
  useEffect(() => {
    const loadSolution = async () => {
      if (!puzzleId) {
        setError('No puzzle ID provided');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        console.log('🔍 Loading solution for puzzle:', puzzleId);
        const data = await getPuzzleSolution(puzzleId);
        
        if (!data) {
          console.warn('⚠️ No solution found for puzzle:', puzzleId);
          setError('No solution found for this puzzle');
          setLoading(false);
          return;
        }
        
        console.log('✅ Solution loaded:', {
          id: data.id,
          solver: data.solver_name,
          type: data.solution_type,
          placed_pieces: data.placed_pieces?.length || 0,
          final_geometry: data.final_geometry ? 'present' : 'missing',
          actions: data.actions?.length || 0
        });
        
        // Extract geometry
        const geometry = data.final_geometry as IJK[];
        if (!geometry || geometry.length === 0) {
          setError('Solution has no geometry');
          setLoading(false);
          return;
        }
        
        setCells(geometry);
        
        // Compute view transforms
        let v;
        try {
          v = computeViewTransforms(geometry, ijkToXyz, T_ijk_to_xyz, quickHullWithCoplanarMerge);
          setView(v);
          console.log(`📐 View computed: ${geometry.length} cells`);
        } catch (err) {
          console.error('Failed to compute view:', err);
          setError('Failed to process geometry');
          setLoading(false);
          return;
        }
        
        // Extract placed pieces - store unsorted initially
        const pieces = (data.placed_pieces || []) as PlacedPiece[];
        setPlacedPieces(pieces);
        
        // Set up reveal slider to show all pieces by default
        setRevealMax(pieces.length);
        setRevealK(pieces.length);
        console.log(`🧩 Loaded ${pieces.length} placed pieces, revealing all`);
        
        // Debug: Log first piece structure
        if (pieces.length > 0) {
          console.log('🔍 First piece structure:', {
            keys: Object.keys(pieces[0]),
            sample: pieces[0],
            hasCells: !!pieces[0].cells,
            hasUid: !!pieces[0].uid,
            cellsLength: pieces[0].cells?.length
          });
        }
        
        setSolution(data);
        
        // Try to load movie settings for this puzzle (optional)
        try {
          const { data: movieData } = await supabase
            .from('movies')
            .select('credits_config')
            .eq('puzzle_id', puzzleId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          
          if (movieData?.credits_config?.scene_settings) {
            const sceneSettings = movieData.credits_config.scene_settings as StudioSettings;
            // Ensure brightness is reasonable for analysis
            const adjustedSettings = {
              ...sceneSettings,
              lights: {
                ...sceneSettings.lights,
                brightness: Math.max(sceneSettings.lights.brightness, 2.0), // At least 2.0
              }
            };
            setEnvSettings(adjustedSettings);
            console.log('🎨 Loaded movie scene settings with brightness:', adjustedSettings.lights.brightness);
          } else {
            console.log('📌 No movie settings found, using default analysis settings');
          }
        } catch (movieErr) {
          console.log('⚠️ Could not load movie settings, using defaults:', movieErr);
        }
        
        // Fetch puzzle statistics
        try {
          // Get puzzle info
          const { data: puzzleData } = await supabase
            .from('puzzles')
            .select('creator_name, created_at')
            .eq('id', puzzleId)
            .single();
          
          // Count total solutions
          const { count: totalCount } = await supabase
            .from('solutions')
            .select('*', { count: 'exact', head: true })
            .eq('puzzle_id', puzzleId);
          
          // Count auto-solved
          const { count: autoCount } = await supabase
            .from('solutions')
            .select('*', { count: 'exact', head: true })
            .eq('puzzle_id', puzzleId)
            .eq('solution_type', 'auto');
          
          // Count manual
          const { count: manualCount } = await supabase
            .from('solutions')
            .select('*', { count: 'exact', head: true })
            .eq('puzzle_id', puzzleId)
            .eq('solution_type', 'manual');
          
          // Count games played
          const { count: gamesCount } = await supabase
            .from('game_sessions')
            .select('*', { count: 'exact', head: true })
            .eq('puzzle_id', puzzleId);
          
          setPuzzleStats({
            cellCount: geometry.length,
            createdAt: puzzleData?.created_at || '',
            creatorName: puzzleData?.creator_name || 'Unknown',
            totalSolutions: totalCount || 0,
            autoSolveCount: autoCount || 0,
            manualSolveCount: manualCount || 0,
            gamesPlayed: gamesCount || 0,
          });
          
          console.log('📊 Loaded puzzle stats:', {
            cells: geometry.length,
            solutions: totalCount,
            games: gamesCount
          });
        } catch (statsErr) {
          console.log('⚠️ Could not load puzzle stats:', statsErr);
        }
        
        setLoading(false);
      } catch (err) {
        console.error('❌ Failed to load solution:', err);
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        setError(`Failed to load solution: ${errorMessage}`);
        setLoading(false);
      }
    };

    loadSolution();
  }, [puzzleId]);

  const handleBackToGallery = () => {
    navigate('/gallery?tab=movies');
  };
  
  // Get visible pieces based on reveal slider with ordering method
  const visiblePieces = React.useMemo(() => {
    if (!view || placedPieces.length === 0) {
      return placedPieces;
    }

    // Calculate metrics for all pieces
    const piecesWithMetrics = placedPieces.map((piece, idx) => {
      const cellsY = piece.cells.map(cell => 
        view.M_world[1][0] * cell.i + view.M_world[1][1] * cell.j + view.M_world[1][2] * cell.k + view.M_world[1][3]
      );
      const minY = Math.min(...cellsY);
      const centroidY = cellsY.reduce((sum, y) => sum + y, 0) / cellsY.length;
      return { piece, minY, centroidY, originalIdx: idx };
    });

    let ordered: typeof piecesWithMetrics;

    if (revealMethod === 'connected') {
      // Connected ordering: BFS from lowest piece, grow by adjacency
      // For FCC lattice, touching spheres are ~1.0 apart in world space
      const neighborThreshold = 1.15; // Tight threshold - only touching spheres
      const neighbors = new Map<number, Set<number>>();
      for (let i = 0; i < piecesWithMetrics.length; i++) {
        neighbors.set(i, new Set());
      }

      // Build adjacency graph
      let connectionCount = 0;
      for (let i = 0; i < piecesWithMetrics.length; i++) {
        for (let j = i + 1; j < piecesWithMetrics.length; j++) {
          const p1 = piecesWithMetrics[i].piece;
          const p2 = piecesWithMetrics[j].piece;

          let areNeighbors = false;
          let minDist = Infinity;
          for (const c1 of p1.cells) {
            const x1 = view.M_world[0][0] * c1.i + view.M_world[0][1] * c1.j + view.M_world[0][2] * c1.k + view.M_world[0][3];
            const y1 = view.M_world[1][0] * c1.i + view.M_world[1][1] * c1.j + view.M_world[1][2] * c1.k + view.M_world[1][3];
            const z1 = view.M_world[2][0] * c1.i + view.M_world[2][1] * c1.j + view.M_world[2][2] * c1.k + view.M_world[2][3];

            for (const c2 of p2.cells) {
              const x2 = view.M_world[0][0] * c2.i + view.M_world[0][1] * c2.j + view.M_world[0][2] * c2.k + view.M_world[0][3];
              const y2 = view.M_world[1][0] * c2.i + view.M_world[1][1] * c2.j + view.M_world[1][2] * c2.k + view.M_world[1][3];
              const z2 = view.M_world[2][0] * c2.i + view.M_world[2][1] * c2.j + view.M_world[2][2] * c2.k + view.M_world[2][3];

              const dist = Math.sqrt((x1-x2)**2 + (y1-y2)**2 + (z1-z2)**2);
              if (dist < minDist) minDist = dist;
              if (dist < neighborThreshold) {
                areNeighbors = true;
                break;
              }
            }
            if (areNeighbors) break;
          }

          if (areNeighbors) {
            neighbors.get(i)!.add(j);
            neighbors.get(j)!.add(i);
            connectionCount++;
          }
        }
      }
      
      console.log(`🔗 Connected reveal: ${connectionCount} connections found between ${piecesWithMetrics.length} pieces`);

      // Find starting piece (lowest minY)
      let startIdx = 0;
      let lowestY = piecesWithMetrics[0].minY;
      for (let i = 1; i < piecesWithMetrics.length; i++) {
        if (piecesWithMetrics[i].minY < lowestY) {
          lowestY = piecesWithMetrics[i].minY;
          startIdx = i;
        }
      }

      // BFS: always pick lowest-Y from frontier
      const revealed = new Set<number>();
      const frontier = new Set<number>([startIdx]);
      ordered = [];
      
      console.log(`🔗 Starting BFS from piece ${startIdx} (pieceId: ${piecesWithMetrics[startIdx].piece.pieceId}, minY: ${piecesWithMetrics[startIdx].minY.toFixed(2)})`);

      while (frontier.size > 0) {
        let bestIdx = -1;
        let bestY = Infinity;
        let bestCentroidY = Infinity;
        let bestOriginalIdx = Infinity;

        for (const idx of frontier) {
          const item = piecesWithMetrics[idx];
          const isLower = item.minY < bestY - 1e-6 ||
                          (Math.abs(item.minY - bestY) < 1e-6 && item.centroidY < bestCentroidY - 1e-6) ||
                          (Math.abs(item.minY - bestY) < 1e-6 && Math.abs(item.centroidY - bestCentroidY) < 1e-6 && item.originalIdx < bestOriginalIdx);

          if (bestIdx === -1 || isLower) {
            bestIdx = idx;
            bestY = item.minY;
            bestCentroidY = item.centroidY;
            bestOriginalIdx = item.originalIdx;
          }
        }

        const selectedPiece = piecesWithMetrics[bestIdx];
        console.log(`  ➡️ Revealing piece ${bestIdx} (${selectedPiece.piece.pieceId}), minY: ${selectedPiece.minY.toFixed(2)}, ${neighbors.get(bestIdx)!.size} neighbors`);
        
        ordered.push(selectedPiece);
        revealed.add(bestIdx);
        frontier.delete(bestIdx);

        const newNeighbors: number[] = [];
        for (const neighborIdx of neighbors.get(bestIdx)!) {
          if (!revealed.has(neighborIdx) && !frontier.has(neighborIdx)) {
            frontier.add(neighborIdx);
            newNeighbors.push(neighborIdx);
          }
        }
        if (newNeighbors.length > 0) {
          console.log(`    ➕ Added ${newNeighbors.length} new pieces to frontier: ${newNeighbors.map(idx => piecesWithMetrics[idx].piece.pieceId).join(', ')}`);
        }
      }
      
      console.log(`🔗 Connected reveal complete: revealed ${ordered.length} pieces`);

      // Handle disconnected components
      if (ordered.length < piecesWithMetrics.length) {
        const remaining = piecesWithMetrics
          .map((item, i) => ({ item, idx: i }))
          .filter(({ idx }) => !revealed.has(idx))
          .sort((a, b) => {
            if (Math.abs(a.item.minY - b.item.minY) > 1e-6) return a.item.minY - b.item.minY;
            if (Math.abs(a.item.centroidY - b.item.centroidY) > 1e-6) return a.item.centroidY - b.item.centroidY;
            return a.item.originalIdx - b.item.originalIdx;
          });

        for (const { item } of remaining) {
          ordered.push(item);
        }
      }
    } else if (revealMethod === 'supported') {
      // Supported ordering: most stable ground-up assembly
      
      // 1. Find ground plane
      const globalMinY = Math.min(...piecesWithMetrics.map(p => p.minY));
      const groundEpsilon = 0.1; // Within 0.1 of ground = grounded
      
      // 2. Build IJK lattice-based adjacency graph
      // Two pieces are adjacent if any of their spheres are exactly 1 lattice unit apart
      const neighbors = new Map<number, Set<number>>();
      for (let i = 0; i < piecesWithMetrics.length; i++) {
        neighbors.set(i, new Set());
      }
      
      console.log(`🏗️ Building IJK lattice adjacency graph...`);
      
      for (let i = 0; i < piecesWithMetrics.length; i++) {
        for (let j = i + 1; j < piecesWithMetrics.length; j++) {
          const p1 = piecesWithMetrics[i].piece;
          const p2 = piecesWithMetrics[j].piece;
          
          // Check if any spheres from p1 and p2 are lattice-adjacent
          let areNeighbors = false;
          for (const c1 of p1.cells) {
            for (const c2 of p2.cells) {
              // IJK Manhattan distance = 1 means they're touching
              const di = Math.abs(c1.i - c2.i);
              const dj = Math.abs(c1.j - c2.j);
              const dk = Math.abs(c1.k - c2.k);
              const manhattanDist = di + dj + dk;
              
              if (manhattanDist === 1) {
                areNeighbors = true;
                break;
              }
            }
            if (areNeighbors) break;
          }
          
          if (areNeighbors) {
            neighbors.get(i)!.add(j);
            neighbors.get(j)!.add(i);
          }
        }
      }
      
      // 3. Count ground contacts per piece (using world Y coordinates)
      const groundContacts = piecesWithMetrics.map((item, idx) => {
        const contacts = item.piece.cells.filter(cell => {
          const y = view.M_world[1][0] * cell.i + view.M_world[1][1] * cell.j + view.M_world[1][2] * cell.k + view.M_world[1][3];
          return y <= globalMinY + groundEpsilon;
        }).length;
        return { idx, contacts, pieceId: item.piece.pieceId };
      });
      
      // Log all ground contacts for debugging
      const piecesWithGroundContact = groundContacts.filter(g => g.contacts > 0).sort((a, b) => b.contacts - a.contacts);
      console.log(`🏗️ Pieces with ground contact: ${piecesWithGroundContact.map(g => `${g.pieceId}(${g.contacts})`).join(', ')}`);
      
      // Build weighted neighbor map (count sphere-to-sphere contacts)
      const neighborWeights = new Map<string, number>(); // "i,j" -> contact count
      
      for (let i = 0; i < piecesWithMetrics.length; i++) {
        for (let j = i + 1; j < piecesWithMetrics.length; j++) {
          if (!neighbors.get(i)!.has(j)) continue; // Only for adjacent pieces
          
          // Count how many spheres touch between these two pieces
          let contactCount = 0;
          for (const cellA of piecesWithMetrics[i].piece.cells) {
            for (const cellB of piecesWithMetrics[j].piece.cells) {
              const di = Math.abs(cellA.i - cellB.i);
              const dj = Math.abs(cellA.j - cellB.j);
              const dk = Math.abs(cellA.k - cellB.k);
              const manhattanDist = di + dj + dk;
              
              if (manhattanDist === 1) {
                contactCount++;
              }
            }
          }
          
          if (contactCount > 0) {
            neighborWeights.set(`${i},${j}`, contactCount);
            neighborWeights.set(`${j},${i}`, contactCount); // Symmetric
          }
        }
      }
      
      // Log adjacency stats
      const avgNeighbors = Array.from(neighbors.values()).reduce((sum, set) => sum + set.size, 0) / neighbors.size;
      const avgWeight = Array.from(neighborWeights.values()).reduce((sum, w) => sum + w, 0) / neighborWeights.size;
      console.log(`🏗️ Adjacency graph built: avg ${avgNeighbors.toFixed(1)} neighbors per piece, avg ${avgWeight.toFixed(1)} contacts per connection`);
      
      // 4. Start with piece with most ground contacts
      let startIdx = 0;
      let maxContacts = groundContacts[0].contacts;
      for (let i = 1; i < groundContacts.length; i++) {
        if (groundContacts[i].contacts > maxContacts) {
          maxContacts = groundContacts[i].contacts;
          startIdx = i;
        }
      }
      
      const startPieceId = piecesWithMetrics[startIdx].piece.pieceId;
      const startNeighborCount = neighbors.get(startIdx)?.size || 0;
      console.log(`🏗️ Starting piece: ${startPieceId} (idx ${startIdx}) with ${maxContacts} ground contacts and ${startNeighborCount} lattice neighbors`);
      
      // 5. Clean rewrite: derive contact deltas and build layers
      type Cell = {i: number; j: number; k: number};
      type Delta = {di: number; dj: number; dk: number};
      
      const cellKey = (c: Cell) => `${c.i},${c.j},${c.k}`;
      const parseKey = (key: string): Cell => {
        const [i, j, k] = key.split(",").map(Number);
        return {i, j, k};
      };
      
      const worldPos = (c: Cell) => {
        const m = view.M_world;
        const x = m[0][0] * c.i + m[0][1] * c.j + m[0][2] * c.k + m[0][3];
        const y = m[1][0] * c.i + m[1][1] * c.j + m[1][2] * c.k + m[1][3];
        const z = m[2][0] * c.i + m[2][1] * c.j + m[2][2] * c.k + m[2][3];
        return {x, y, z};
      };
      
      const deltaKey = (d: Delta) => `${d.di},${d.dj},${d.dk}`;
      
      // Build global cell set
      const allCellKeys: string[] = [];
      const allCellSet = new Set<string>();
      
      for (let p = 0; p < piecesWithMetrics.length; p++) {
        for (const c of piecesWithMetrics[p].piece.cells) {
          const k = cellKey(c);
          if (!allCellSet.has(k)) {
            allCellSet.add(k);
            allCellKeys.push(k);
          }
        }
      }
      
      console.log(`🔍 Deriving contact deltas from full solution (${piecesWithMetrics.length} pieces, ${allCellKeys.length} spheres)...`);
      
      // Derive contact deltas - enumerate all IJK offsets that have occupied neighbors
      // This creates a lenient support model that accepts near-neighbors for stability
      const R = 2; // Search window for IJK neighbors
      const deltaSet = new Set<string>();
      
      for (const aKey of allCellKeys) {
        const a = parseKey(aKey);
        
        // Check all IJK neighbors in search window
        for (let di = -R; di <= R; di++) {
          for (let dj = -R; dj <= R; dj++) {
            for (let dk = -R; dk <= R; dk++) {
              if (di === 0 && dj === 0 && dk === 0) continue;
              
              const bKey = `${a.i+di},${a.j+dj},${a.k+dk}`;
              if (allCellSet.has(bKey)) {
                // This IJK offset has an actual neighbor
                deltaSet.add(deltaKey({di, dj, dk}));
              }
            }
          }
        }
      }
      
      const contactDeltas = Array.from(deltaSet).map(s => {
        const [di, dj, dk] = s.split(",").map(Number);
        return {di, dj, dk};
      });
      
      console.log(`🔧 Derived ${contactDeltas.length} support deltas in IJK space`);
      console.log(`🔧 Sample deltas: ${contactDeltas.slice(0, 10).map(deltaKey).join(" | ")}`);
      
      // Build robust layer mapping (cluster heights)
      const ys: number[] = [];
      const cellY = new Map<string, number>();
      
      for (const k of allCellKeys) {
        const c = parseKey(k);
        const y = worldPos(c).y;
        ys.push(y);
        cellY.set(k, y);
      }
      
      ys.sort((a, b) => a - b);
      
      // Cluster into layer centers
      let minGap = Infinity;
      for (let i = 1; i < ys.length; i++) {
        const g = ys[i] - ys[i - 1];
        if (g > 1e-6 && g < minGap) minGap = g;
      }
      
      const gap = isFinite(minGap) ? minGap : 0.1;
      const splitGap = gap * 0.5;
      
      const layerCenters: number[] = [];
      let bucket: number[] = [ys[0]];
      
      for (let i = 1; i < ys.length; i++) {
        if (ys[i] - ys[i - 1] > splitGap) {
          const center = bucket.reduce((s, v) => s + v, 0) / bucket.length;
          layerCenters.push(center);
          bucket = [ys[i]];
        } else {
          bucket.push(ys[i]);
        }
      }
      if (bucket.length) {
        const center = bucket.reduce((s, v) => s + v, 0) / bucket.length;
        layerCenters.push(center);
      }
      
      // Map each cell to nearest center
      const cellToLayer = new Map<string, number>();
      for (const k of allCellKeys) {
        const y = cellY.get(k)!;
        let best = 0;
        let bestAbs = Math.abs(y - layerCenters[0]);
        for (let i = 1; i < layerCenters.length; i++) {
          const a = Math.abs(y - layerCenters[i]);
          if (a < bestAbs) { bestAbs = a; best = i; }
        }
        cellToLayer.set(k, best);
      }
      
      console.log(`🏗️ Identified ${layerCenters.length} layers`);
      
      // 6. Support validation - pieces can be supported by their own lower spheres
      const revealedCells = new Set<string>();
      
      const isPieceSupported = (pieceIdx: number): {ok: boolean; supportedSpheres: number; groundSpheres: number} => {
        const piece = piecesWithMetrics[pieceIdx].piece;
        
        // Create temporary support set that includes this piece's own spheres
        // This allows upper spheres to be supported by lower spheres within the same piece
        const tempSupportSet = new Set(revealedCells);
        for (const c of piece.cells) {
          tempSupportSet.add(cellKey(c));
        }
        
        let supported = 0;
        let ground = 0;
        
        for (const c of piece.cells) {
          const k = cellKey(c);
          const L = cellToLayer.get(k);
          if (L === undefined) continue;
          
          if (L === 0) {
            ground++;
            supported++;
            continue;
          }
          
          // Count supports from layer below (including this piece's own lower spheres)
          let supportsBelow = 0;
          for (const d of contactDeltas) {
            const n: Cell = {i: c.i + d.di, j: c.j + d.dj, k: c.k + d.dk};
            const nk = cellKey(n);
            if (!tempSupportSet.has(nk)) continue;
            const Ln = cellToLayer.get(nk);
            if (Ln === L - 1) supportsBelow++;
          }
          
          if (supportsBelow >= 3) supported++;
        }
        
        // Require ALL spheres to be supported (4/4) - no floating spheres allowed
        // Even if some spheres are grounded, upper spheres must have stable support
        return {ok: supported === 4, supportedSpheres: supported, groundSpheres: ground};
      };
      
      // 7. Pre-score all pieces based on intrinsic properties
      // Scoring philosophy: Connection strength > Ground contact
      // - Strong multi-contact connections (500 pts/contact) prioritized
      // - Example: 4 sphere contacts (2000 pts) beats 1 ground sphere (1000 pts)
      // - This builds stable, well-connected clusters rather than weakly-grounded pieces
      type ScoredPiece = {
        item: typeof piecesWithMetrics[0];
        idx: number;
        groundSpheres: number;
        totalNeighbors: number;
        avgLayer: number;
        score: number;
      };
      
      const scoredPieces: ScoredPiece[] = [];
      
      console.log(`🏗️ Pre-sorting all ${piecesWithMetrics.length} pieces by FCC support and clustering...`);
      
      for (let idx = 0; idx < piecesWithMetrics.length; idx++) {
        const item = piecesWithMetrics[idx];
        const piece = item.piece;
        
        // Count ground spheres (intrinsic property)
        const groundSpheres = groundContacts[idx].contacts;
        
        // Count total potential neighbors (all adjacent pieces, not just revealed)
        const totalNeighbors = neighbors.get(idx)?.size || 0;
        
        // Calculate average layer of this piece's spheres
        let layerSum = 0;
        let layerCount = 0;
        for (const cell of piece.cells) {
          const layer = cellToLayer.get(cellKey(cell));
          if (layer !== undefined) {
            layerSum += layer;
            layerCount++;
          }
        }
        const avgLayer = layerCount > 0 ? layerSum / layerCount : 0;
        
        // Scoring (intrinsic properties only - dynamics added during placement):
        // - Ground spheres: 1000 per sphere (provides base stability)
        // - Total neighbors: 100 per neighbor (potential connections)
        // - Lower layers: subtract avgLayer (build bottom-up)
        const score = groundSpheres * 1000 + totalNeighbors * 100 - avgLayer;
        
        scoredPieces.push({
          item,
          idx,
          groundSpheres,
          totalNeighbors,
          avgLayer,
          score
        });
      }
      
      // Create lookup map for quick scoring
      const scoreMap = new Map<number, ScoredPiece>();
      scoredPieces.forEach(sp => scoreMap.set(sp.idx, sp));
      
      console.log(`🏗️ Pre-scored pieces. Top 5 by intrinsic score: ${scoredPieces.slice(0, 5).map(p => `${p.item.piece.pieceId}(ground:${p.groundSpheres}, neighbors:${p.totalNeighbors})`).join(', ')}`);
      
      // 10. Build reveal order using frontier to ensure connectivity
      const revealed = new Set<number>();
      const frontier = new Set<number>();
      ordered = [];
      
      // Start with the piece that has most ground contacts (startIdx = D)
      const startPiece = piecesWithMetrics[startIdx];
      ordered.push(startPiece);
      revealed.add(startIdx);
      
      // Initialize revealedCells with start piece
      for (const cell of startPiece.piece.cells) {
        revealedCells.add(cellKey(cell));
      }
      
      // Add its neighbors to frontier
      for (const neighborIdx of neighbors.get(startIdx)!) {
        frontier.add(neighborIdx);
      }
      
      const startGroundCount = groundContacts[startIdx].contacts;
      console.log(`🏗️ Starting cluster assembly with piece ${startIdx} (${startPiece.piece.pieceId}), ground: ${startGroundCount}`);
      console.log(`🏗️ Each subsequent piece will connect to the ENTIRE assembled cluster`);
      
      while (frontier.size > 0) {
        // Rebuild revealed cells registry
        revealedCells.clear();
        for (const idx of revealed) {
          const piece = piecesWithMetrics[idx].piece;
          for (const cell of piece.cells) {
            revealedCells.add(cellKey(cell));
          }
        }
        
        let bestIdx = -1;
        let bestScore = -Infinity;
        
        const enableDebug = ordered.length < 10;
        
        // Find best piece from frontier that has valid FCC support
        for (const idx of frontier) {
          const { ok: supported } = isPieceSupported(idx);
          
          if (supported) {
            const scoredPiece = scoreMap.get(idx)!;
            
            // Calculate weighted connection strength to ENTIRE assembled cluster
            // Each new piece connects to the whole structure, not just individual pieces
            // Sum up all sphere-to-sphere contacts across ALL revealed pieces
            let connectionStrength = 0;
            const clusterConnections: {pieceIdx: number, contacts: number}[] = [];
            
            for (const revealedIdx of revealed) {
              const weight = neighborWeights.get(`${idx},${revealedIdx}`) || 0;
              if (weight > 0) {
                connectionStrength += weight;
                clusterConnections.push({pieceIdx: revealedIdx, contacts: weight});
              }
            }
            
            // Score = intrinsic score + weighted connections to assembled cluster
            // Connection strength heavily weighted (500 per contact) to prioritize
            // strong multi-contact connections over weakly-grounded pieces
            // Example: 4 contacts to cluster (2000) beats 1 ground sphere (1000)
            const dynamicScore = scoredPiece.score + connectionStrength * 500;
            
            if (dynamicScore > bestScore) {
              bestIdx = idx;
              bestScore = dynamicScore;
            }
          }
        }
        
        if (bestIdx === -1) {
          console.log(`⚠️ No valid supported pieces in frontier of ${frontier.size} candidates`);
          console.log(`⚠️ Requirement: ALL 4 spheres must be supported (no floating spheres allowed)`);
          if (enableDebug) {
            for (const idx of frontier) {
              const { supportedSpheres, groundSpheres } = isPieceSupported(idx);
              console.log(`    ❌ Piece ${idx} (${piecesWithMetrics[idx].piece.pieceId}): ${supportedSpheres}/4 spheres supported, ${groundSpheres} on ground - ${supportedSpheres < 4 ? 'REJECTED (not all spheres supported)' : 'OK'}`);
            }
          }
          break;
        }
        
        // Place best piece (all 4 spheres guaranteed to be supported)
        const selectedPiece = piecesWithMetrics[bestIdx];
        const { supportedSpheres, groundSpheres } = isPieceSupported(bestIdx);
        const details = `ALL spheres supported (${groundSpheres} on ground, ${supportedSpheres - groundSpheres} via neighbors)`;
        
        if (ordered.length <= 10) {
          // Show connections to entire assembled cluster
          let connectionStrength = 0;
          const clusterConnections: string[] = [];
          
          for (const revealedIdx of revealed) {
            const weight = neighborWeights.get(`${bestIdx},${revealedIdx}`) || 0;
            if (weight > 0) {
              connectionStrength += weight;
              const revealedPieceId = piecesWithMetrics[revealedIdx].piece.pieceId;
              clusterConnections.push(`${revealedPieceId}(${weight})`);
            }
          }
          
          const scoredPiece = scoreMap.get(bestIdx)!;
          const connectionScore = connectionStrength * 500;
          console.log(`  🏗️ Placing #${ordered.length + 1}: piece ${bestIdx} (${selectedPiece.piece.pieceId}), ${details}`);
          console.log(`      📊 Score: base=${scoredPiece.score.toFixed(0)} + cluster_contacts=${connectionScore.toFixed(0)} = ${bestScore.toFixed(0)}`);
          if (clusterConnections.length > 0) {
            console.log(`      🔗 Connects to cluster: ${clusterConnections.join(', ')}`);
          }
        }
        
        ordered.push(selectedPiece);
        revealed.add(bestIdx);
        frontier.delete(bestIdx);
        
        // Add its neighbors to frontier
        for (const neighborIdx of neighbors.get(bestIdx)!) {
          if (!revealed.has(neighborIdx) && !frontier.has(neighborIdx)) {
            frontier.add(neighborIdx);
          }
        }
      }
      
      console.log(`🏗️ Connected assembly complete: placed ${ordered.length}/${piecesWithMetrics.length} pieces`);
      
      // Handle disconnected components
      if (ordered.length < piecesWithMetrics.length) {
        const remaining = piecesWithMetrics
          .map((item, i) => ({ item, idx: i }))
          .filter(({ idx }) => !revealed.has(idx))
          .sort((a, b) => {
            const aGround = groundContacts[a.idx].contacts;
            const bGround = groundContacts[b.idx].contacts;
            if (aGround !== bGround) return bGround - aGround;
            if (Math.abs(a.item.minY - b.item.minY) > 1e-6) return a.item.minY - b.item.minY;
            return a.item.originalIdx - b.item.originalIdx;
          });
        
        for (const { item } of remaining) {
          ordered.push(item);
        }
      }
    } else {
      // Global ordering: sort by minY
      ordered = piecesWithMetrics.slice().sort((a, b) => {
        if (Math.abs(a.minY - b.minY) > 1e-6) return a.minY - b.minY;
        if (Math.abs(a.centroidY - b.centroidY) > 1e-6) return a.centroidY - b.centroidY;
        return a.originalIdx - b.originalIdx;
      });
    }

    // Apply reveal slider
    if (revealMax === 0) {
      return ordered.map(item => item.piece);
    }
    return ordered.slice(0, revealK).map(item => item.piece);
  }, [placedPieces, revealK, revealMax, revealMethod, view]);

  const selectedPiece = React.useMemo(() => {
    if (!selectedPieceUid) return null;
    return placedPieces.find((p) => p.uid === selectedPieceUid) || null;
  }, [placedPieces, selectedPieceUid]);

  // Hide container when reveal is active (only show pieces)
  const containerOpacity = revealMax > 0 && revealK < placedPieces.length ? 0 : 0.15;

  if (loading) {
    return (
      <div
        style={{
          width: '100vw',
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#000',
          color: '#fff',
          fontSize: '1.2rem',
        }}
      >
        Loading solution...
      </div>
    );
  }

  if (error || !solution) {
    return (
      <div
        style={{
          width: '100vw',
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#000',
          color: '#fff',
          gap: '20px',
        }}
      >
        <div style={{ fontSize: '1.2rem' }}>{error || 'Solution not found'}</div>
        <button
          onClick={handleBackToGallery}
          style={{
            background: 'rgba(255, 255, 255, 0.2)',
            border: '1px solid rgba(255, 255, 255, 0.3)',
            borderRadius: '8px',
            color: '#fff',
            padding: '12px 24px',
            fontSize: '1rem',
            cursor: 'pointer',
          }}
        >
          Back to Gallery
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        position: 'relative',
        overflow: 'hidden',
        background: '#000',
      }}
    >
      <div
        style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          display: 'flex',
          gap: '8px',
          zIndex: 1000
        }}
      >
        <button
          className="pill"
          onClick={() => setShowPresetModal(true)}
          title="Environment"
          style={{
            background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
            color: '#fff',
            fontWeight: 700,
            border: 'none',
            fontSize: '16px',
            width: '40px',
            height: '40px',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
            transition: 'all 0.2s ease',
            cursor: 'pointer'
          }}
        >
          ⚙
        </button>

        <button
          className="pill pill--chrome"
          onClick={() => setShowInfoModal(true)}
          title="Solution Information"
          style={{
            width: '44px',
            padding: 0,
            background: 'rgba(0, 0, 0, 0.35)',
            border: '1px solid rgba(0, 0, 0, 0.25)',
            color: '#ffffff',
            fontWeight: 800,
            fontSize: '18px'
          }}
        >
          i
        </button>

        <button
          className="pill"
          onClick={() => navigate('/')}
          title="Home"
          style={{
            background: 'linear-gradient(135deg, #667eea, #764ba2)',
            color: '#fff',
            fontWeight: 700,
            border: 'none',
            fontSize: '16px',
            width: '40px',
            height: '40px',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
            transition: 'all 0.2s ease',
            cursor: 'pointer'
          }}
        >
          🏠
        </button>
      </div>

      {/* 3D Canvas - Full screen container */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          zIndex: 0,
        }}
      >
        {view && cells.length > 0 ? (
          <>
            {console.log('🎬 Rendering SceneCanvas:', {
              cellsCount: cells.length,
              viewPresent: !!view,
              visiblePiecesCount: visiblePieces.length,
              explosionFactor,
              brightness: envSettings.lights.brightness
            })}
            <SceneCanvas
              cells={cells}
              view={view}
              editMode={false}
              mode="add"
              onCellsChange={() => {}}
              layout="fullscreen"
              placedPieces={visiblePieces}
              hidePlacedPieces={false}
              explosionFactor={explosionFactor}
              settings={envSettings}
              puzzleMode="unlimited"
              showBonds={true}
              containerOpacity={containerOpacity}
              containerColor="#888888"
              alwaysShowContainer={true}
              visibility={{
                xray: false,
                emptyOnly: false,
                sliceY: { center: 0.5, thickness: 1.0 },
              }}
              onSelectPiece={() => {}}
              onInteraction={(target, type, data) => {
                if (target !== 'piece' || type !== 'double') return;
                const uid = typeof data === 'string' ? data : data?.uid;
                if (!uid) return;
                setSelectedPieceUid(uid);
                setShowPieceModal(true);
              }}
            />
          </>
        ) : (
          <>
            {console.log('⚠️ NOT rendering SceneCanvas:', {
              viewPresent: !!view,
              cellsCount: cells.length,
              reason: !view ? 'no view' : 'no cells'
            })}
          </>
        )}
      </div>

      {/* Slider Controls */}
      <AutoSolveSlidersPanel
        revealK={revealK}
        revealMax={revealMax}
        explosionFactor={explosionFactor}
        revealMethod={revealMethod}
        onChangeRevealK={setRevealK}
        onChangeExplosionFactor={setExplosionFactor}
        onChangeRevealMethod={setRevealMethod}
      />

      <PresetSelectorModal
        isOpen={showPresetModal}
        currentPreset={currentPreset}
        onClose={() => setShowPresetModal(false)}
        onSelectPreset={(presetSettings, presetKey) => {
          setEnvSettings(presetSettings);
          setCurrentPreset(presetKey);
          try {
            localStorage.setItem('solutions.environmentPreset', presetKey);
          } catch {
            // ignore
          }
        }}
      />

      {/* Solution Info Modal */}
      {showInfoModal && solution && (
        <SolutionInfoModal
          isOpen={showInfoModal}
          onClose={() => setShowInfoModal(false)}
          solution={solution}
          puzzleStats={puzzleStats || undefined}
        />
      )}

      <PieceViewerModal
        isOpen={showPieceModal && !!selectedPiece}
        onClose={() => {
          setShowPieceModal(false);
          setSelectedPieceUid(null);
        }}
        piece={selectedPiece}
        settings={envSettings}
      />
    </div>
  );
};
