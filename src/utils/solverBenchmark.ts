// src/utils/solverBenchmark.ts
// Performance benchmarking utility for Engine2 solver

import { engine2Solve, engine2Precompute, type PieceDB } from '../engines/engine2';
import type { Engine2Settings } from '../engines/engine2';

export type BenchmarkConfig = {
  name: string;
  settings: Partial<Engine2Settings>;
};

export type BenchmarkTrialResult = {
  config: string;
  trial: number;
  success: boolean;
  reason: string;
  elapsedMs: number;
  nodes: number;
  solutions: number;
  timing?: {
    totalMs: number;
    dlxMs: number;
    dlxCalls: number;
    pruneStats: Record<string, number>;
    restartCount: number;
    bestDepth: number;
    maxDepthHits: number;
  };
};

export type BenchmarkResult = {
  puzzleId: string;
  puzzleName: string;
  containerCells: number;
  timestamp: string;
  trials: BenchmarkTrialResult[];
  summary: {
    [configName: string]: {
      avgElapsedMs: number;
      avgNodes: number;
      avgDlxMs: number;
      avgDfsMs: number;
      successRate: number;
      trials: number;
    };
  };
};

const DEFAULT_CONFIGS: BenchmarkConfig[] = [
  {
    name: 'Baseline (minimal pruning)',
    settings: {
      maxSolutions: 1,
      pauseOnSolution: false,
      timeoutMs: 10000,
      randomizeTies: false,
      shuffleStrategy: 'initial',
      moveOrdering: 'mostConstrainedCell',
      tt: { enable: false },
      tailSwitch: { enable: false },
      pruning: { multipleOf4: true, connectivity: false, colorResidue: false, neighborTouch: false },
    },
  },
  {
    name: 'Connectivity pruning',
    settings: {
      maxSolutions: 1,
      pauseOnSolution: false,
      timeoutMs: 10000,
      randomizeTies: false,
      shuffleStrategy: 'initial',
      moveOrdering: 'mostConstrainedCell',
      tt: { enable: false },
      tailSwitch: { enable: false },
      pruning: { multipleOf4: true, connectivity: true, colorResidue: false, neighborTouch: false },
    },
  },
  {
    name: 'All pruning enabled',
    settings: {
      maxSolutions: 1,
      pauseOnSolution: false,
      timeoutMs: 10000,
      randomizeTies: false,
      shuffleStrategy: 'initial',
      moveOrdering: 'mostConstrainedCell',
      tt: { enable: false },
      tailSwitch: { enable: false },
      pruning: { multipleOf4: true, connectivity: true, colorResidue: true, neighborTouch: true },
    },
  },
];

export type BenchmarkInput = {
  puzzleId: string;
  puzzleName: string;
  geometry: { i: number; j: number; k: number }[] | [number, number, number][];
  pieceDB: PieceDB;
};

export async function runBenchmark(
  input: BenchmarkInput,
  trialsPerConfig: number = 3,
  configs: BenchmarkConfig[] = DEFAULT_CONFIGS
): Promise<BenchmarkResult> {
  const { puzzleId, puzzleName, geometry, pieceDB } = input;
  
  console.log(`🏁 Starting benchmark for puzzle ${puzzleId}`);
  console.log(`   Trials per config: ${trialsPerConfig}`);
  console.log(`   Configs: ${configs.map(c => c.name).join(', ')}`);

  const containerCells = geometry?.length ?? 0;
  console.log(`📦 Puzzle: ${puzzleName} (${containerCells} cells)`);

  if (!pieceDB || pieceDB.size === 0) {
    throw new Error('No pieces provided');
  }

  // Precompute solver data
  console.log('⚙️ Precomputing solver data...');
  console.log(`   Geometry cells: ${geometry?.length ?? 'undefined'}`);
  console.log(`   PieceDB size: ${pieceDB?.size ?? 'undefined'}`);
  
  if (!geometry || geometry.length === 0) {
    throw new Error('No geometry cells provided');
  }
  
  // Convert geometry to [i,j,k] format if needed (puzzle.geometry uses {i,j,k} objects)
  const cells: [number, number, number][] = geometry.map((cell: any) => {
    if (Array.isArray(cell)) {
      return cell as [number, number, number];
    }
    return [cell.i, cell.j, cell.k] as [number, number, number];
  });
  
  const pre = engine2Precompute(
    { cells, id: puzzleId },
    pieceDB
  );
  console.log(`   N=${pre.N} cells, ${pieceDB.size} piece types`);
  console.log(`   Pre object keys: ${Object.keys(pre).join(', ')}`);

  const trials: BenchmarkTrialResult[] = [];

  for (const config of configs) {
    console.log(`\n🔧 Config: ${config.name}`);

    for (let trial = 1; trial <= trialsPerConfig; trial++) {
      console.log(`   Trial ${trial}/${trialsPerConfig}...`);

      // Generate unique seed per trial
      const seed = Date.now() + trial * 1000;

      const settings: Engine2Settings = {
        ...config.settings,
        seed,
        statusIntervalMs: 1000, // Less frequent updates during benchmark
      };

      const result = await runSingleTrial(pre, settings, config.name, trial);
      trials.push(result);

      console.log(`   → ${result.success ? '✅' : '❌'} ${result.elapsedMs.toFixed(0)}ms, ${result.nodes} nodes`);
      if (result.timing) {
        console.log(`     DLX: ${result.timing.dlxMs.toFixed(0)}ms (${result.timing.dlxCalls} calls)`);
      }
    }
  }

  // Build summary
  const summary: BenchmarkResult['summary'] = {};
  for (const config of configs) {
    const configTrials = trials.filter(t => t.config === config.name);
    const successTrials = configTrials.filter(t => t.success);

    summary[config.name] = {
      avgElapsedMs: avg(configTrials.map(t => t.elapsedMs)),
      avgNodes: avg(configTrials.map(t => t.nodes)),
      avgDlxMs: avg(configTrials.filter(t => t.timing).map(t => t.timing!.dlxMs)),
      avgDfsMs: avg(configTrials.filter(t => t.timing).map(t => t.timing!.totalMs - t.timing!.dlxMs)),
      successRate: successTrials.length / configTrials.length,
      trials: configTrials.length,
    };
  }

  const result: BenchmarkResult = {
    puzzleId,
    puzzleName,
    containerCells,
    timestamp: new Date().toISOString(),
    trials,
    summary,
  };

  console.log('\n📊 BENCHMARK COMPLETE');
  console.log('='.repeat(50));
  for (const [name, stats] of Object.entries(summary)) {
    console.log(`${name}:`);
    console.log(`  Avg time: ${stats.avgElapsedMs.toFixed(0)}ms`);
    console.log(`  Avg nodes: ${stats.avgNodes.toFixed(0)}`);
    console.log(`  Avg DLX: ${stats.avgDlxMs.toFixed(0)}ms`);
    console.log(`  Avg DFS: ${stats.avgDfsMs.toFixed(0)}ms`);
    console.log(`  Success: ${(stats.successRate * 100).toFixed(0)}%`);
  }

  return result;
}

async function runSingleTrial(
  pre: ReturnType<typeof engine2Precompute>,
  settings: Engine2Settings,
  configName: string,
  trialNum: number
): Promise<BenchmarkTrialResult> {
  return new Promise((resolve) => {
    let lastStatus: any = null;

    const handle = engine2Solve(pre, settings, {
      onStatus: (status) => {
        lastStatus = status;
      },
      onDone: (summary) => {
        resolve({
          config: configName,
          trial: trialNum,
          success: summary.solutions > 0,
          reason: summary.reason,
          elapsedMs: summary.elapsedMs,
          nodes: summary.nodes,
          solutions: summary.solutions,
          timing: summary.timing,
        });
      },
    });
  });
}

function avg(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

// Export for console access
if (typeof window !== 'undefined') {
  (window as any).runSolverBenchmark = runBenchmark;
  console.log('🔬 Solver benchmark available: window.runSolverBenchmark(puzzleId, trialsPerConfig)');
}
