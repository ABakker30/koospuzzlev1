// Headless engine-settings benchmark. Run: npx tsx scripts/engineBench.mts <stage>
// Measures time-to-first-solution (TTFS) per (config × puzzle × seed).
//
// NOTE: run under Node (tsx), so typeof window === undefined → the DLX tail
// uses its full time budget (no 250ms main-thread cap). This measures raw
// SEARCH-STRATEGY quality; the main-thread cap is a UI-responsiveness safety
// that applies equally on top of whichever strategy wins.

import { readFileSync } from 'node:fs';

(globalThis as any).fetch = async (url: any) => {
  if (String(url).includes('pieces_orientations.py')) {
    return { ok: true, text: async () => readFileSync('public/data/Pieces/pieces_orientations.py', 'utf8') } as any;
  }
  throw new Error('unexpected fetch ' + url);
};

const eng = await import('../src/engines/engine2/index.ts');
const pl = await import('../src/engines/piecesLoader.ts');
const GEOM = JSON.parse(readFileSync('scripts/benchGeom.json', 'utf8')) as Record<string, { i: number; j: number; k: number }[]>;

const db = await pl.loadAllPieces();

// The engine logs verbosely; that I/O both spams output and (crucially)
// distorts timing. Silence console during runs; keep a real logger for our
// own summary output.
const out = console.log.bind(console);
console.log = () => {};
console.warn = () => {};
console.error = () => {};

type Settings = Record<string, any>;

function baseSettings(): Settings {
  return {
    maxSolutions: 1,
    pauseOnSolution: false,
    statusIntervalMs: 100000,       // effectively silent
    moveOrdering: 'mostConstrainedCell',
    pruning: { connectivity: true, multipleOf4: true, colorResidue: true, neighborTouch: true },
    tt: { enable: true },
    tailSwitch: { enable: false },
    randomizeTies: false,
    shuffleStrategy: 'none',
  };
}

type RunResult = { ttfsMs: number; nodes: number; solved: boolean; dlxMs: number; dlxCalls: number; restarts: number; reason: string; bestDepth: number };

function runOne(geomKey: string, settings: Settings, seed: number, budgetMs: number): Promise<RunResult> {
  const cells = GEOM[geomKey].map(c => [c.i, c.j, c.k] as [number, number, number]);
  const pre = eng.engine2Precompute({ cells, id: geomKey }, db);
  const cfg = { ...settings, seed, timeoutMs: budgetMs };
  return new Promise<RunResult>((resolve) => {
    const t0 = performance.now();
    let solvedAt = -1;
    eng.engine2Solve(pre, cfg, {
      onSolution: () => { if (solvedAt < 0) solvedAt = performance.now() - t0; },
      onDone: (s: any) => {
        resolve({
          ttfsMs: solvedAt >= 0 ? solvedAt : budgetMs,
          nodes: s.nodes,
          solved: solvedAt >= 0,
          dlxMs: Math.round(s.timing?.dlxMs ?? 0),
          dlxCalls: s.timing?.dlxCalls ?? 0,
          restarts: s.timing?.restartCount ?? 0,
          reason: s.reason,
          bestDepth: s.timing?.bestDepth ?? 0,
        });
      },
    }).resume();
  });
}

const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };

async function sweep(configs: { name: string; settings: Settings }[], puzzles: string[], seeds: number[], budgetMs: number) {
  const rows: { name: string; solveRate: number; medTtfs: number; detail: string }[] = [];
  for (const c of configs) {
    const per: string[] = [];
    let solves = 0, total = 0;
    const allTtfs: number[] = [];
    for (const pz of puzzles) {
      const ttfs: number[] = [];
      let ps = 0;
      for (const seed of seeds) {
        const r = await runOne(pz, c.settings, seed, budgetMs);
        total++; if (r.solved) { solves++; ps++; }
        ttfs.push(r.ttfsMs); allTtfs.push(r.solved ? r.ttfsMs : budgetMs);
      }
      per.push(`${pz}:${ps}/${seeds.length}@${Math.round(median(ttfs))}ms`);
    }
    rows.push({ name: c.name, solveRate: solves / total, medTtfs: Math.round(median(allTtfs)), detail: per.join('  ') });
  }
  rows.sort((a, b) => b.solveRate - a.solveRate || a.medTtfs - b.medTtfs);
  out('\n=== RESULTS (sorted by solve-rate, then median TTFS) ===');
  for (const r of rows) {
    out(`${(r.solveRate * 100).toFixed(0).padStart(3)}%  med=${String(r.medTtfs).padStart(6)}ms  ${r.name.padEnd(26)} | ${r.detail}`);
  }
}

const tail = (th: number | false) => th === false ? { enable: false } : { enable: true, dlxThreshold: th, dlxTimeoutMs: 30000 };
const restartTime = (s: number) => ({ shuffleStrategy: 'periodicRestartTime', restartIntervalSeconds: s, maxRestarts: 999999 });

const stage = process.argv[2] ?? 'calibrate';

if (stage === 'calibrate') {
  const cal = { ...baseSettings(), tailSwitch: tail(32), randomizeTies: true };
  out('CALIBRATION (tail32+randomize, budget 20s, 1 seed):');
  for (const pz of Object.keys(GEOM)) {
    const r = await runOne(pz, cal, 12345, 20000);
    out(`  ${pz.padEnd(8)} n=${GEOM[pz].length}  ${r.solved ? 'SOLVED @ ' + Math.round(r.ttfsMs) + 'ms' : 'unsolved(budget)'}  nodes=${r.nodes}  dlx=${r.dlxMs}ms/${r.dlxCalls}  restarts=${r.restarts}`);
  }
}

if (stage === 'probe') {
  // Are the hard puzzles solvable at all, and does restart help?
  out('PROBE hard puzzles (budget 30s):');
  const configs = [
    { name: 'tail32+rand, noRestart', s: { ...baseSettings(), tailSwitch: tail(32), randomizeTies: true } },
    { name: 'tail32+rand, restart1s', s: { ...baseSettings(), tailSwitch: tail(32), randomizeTies: true, ...restartTime(1) } },
    { name: 'tail48+rand, restart1s', s: { ...baseSettings(), tailSwitch: tail(48), randomizeTies: true, ...restartTime(1) } },
  ];
  for (const pz of ['g56', 'pyr100']) {
    for (const c of configs) {
      const r = await runOne(pz, c.s, 7, 30000);
      out(`  ${pz.padEnd(7)} ${c.name.padEnd(26)} ${r.solved ? 'SOLVED @ ' + Math.round(r.ttfsMs) + 'ms' : 'unsolved'}  nodes=${r.nodes} dlx=${r.dlxCalls} restarts=${r.restarts}`);
    }
  }
}

if (stage === 'tailValue') {
  // Isolate tail threshold on easy/medium puzzles, deterministic DFS.
  const mk = (th: number | false) => ({ ...baseSettings(), tailSwitch: tail(th) });
  const configs = [
    { name: 'tailOff', settings: mk(false) },
    { name: 'tail24', settings: mk(24) },
    { name: 'tail32', settings: mk(32) },
    { name: 'tail48', settings: mk(48) },
    { name: 'tail64', settings: mk(64) },
  ];
  await sweep(configs, ['g24', 'g28', 'g36', 'g40'], [1], 20000);
}

if (stage === 'restartValue') {
  // Isolate restart interval on the seed-sensitive hard puzzle, many seeds.
  const mk = (extra: Settings) => ({ ...baseSettings(), tailSwitch: tail(48), randomizeTies: true, ...extra });
  const configs = [
    { name: 'tailOff+noRestart', settings: { ...baseSettings(), tailSwitch: tail(false), randomizeTies: true } },
    { name: 'noRestart', settings: mk({}) },
    { name: 'restart0.5s', settings: mk(restartTime(0.5)) },
    { name: 'restart1s', settings: mk(restartTime(1)) },
    { name: 'restart2s', settings: mk(restartTime(2)) },
    { name: 'restart3s', settings: mk(restartTime(3)) },
  ];
  await sweep(configs, ['g56'], [1, 2, 3, 4, 5, 6, 7, 8], 15000);
}

if (stage === 'threshold') {
  // Best tail threshold on the puzzle where the tail matters (g56), many seeds.
  const mk = (th: number) => ({ ...baseSettings(), tailSwitch: tail(th), randomizeTies: true });
  const configs = [
    { name: 'tail24', settings: mk(24) },
    { name: 'tail32', settings: mk(32) },
    { name: 'tail40', settings: mk(40) },
    { name: 'tail48', settings: mk(48) },
    { name: 'tail64', settings: mk(64) },
  ];
  await sweep(configs, ['g56'], [1, 2, 3, 4, 5, 6, 7, 8], 15000);
}

if (stage === 'crossover') {
  // DLX tail vs DFS on the SAME completable endgame subproblem, by K open cells.
  // Method: fully solve a puzzle, then hold out a random subset of M pieces →
  // their cells form a sub-container with a known completion. Time DLX-exact-
  // cover vs DFS-to-first-completion on that identical subproblem.
  const dlxMod = await import('../src/engines/engine2/dlx.ts');
  const puz = 'g56';
  const fullCells = GEOM[puz].map(c => [c.i, c.j, c.k] as [number, number, number]);
  const fullPre = eng.engine2Precompute({ cells: fullCells, id: puz }, db);

  // Get one full solution (tail on) → list of {pid, ori, t, cells}.
  const sol: { pid: string; ori: number; t: number[]; cells: [number, number, number][] }[] = await new Promise((res) => {
    eng.engine2Solve(fullPre, { ...baseSettings(), tailSwitch: tail(40), randomizeTies: true, seed: 1, timeoutMs: 20000 }, {
      onSolution: (pls: any[]) => {
        res(pls.map(p => {
          const oris = fullPre.pieces.get(p.pieceId)!;
          const o = oris.find((x: any) => x.id === p.ori)!;
          return { pid: p.pieceId, ori: p.ori, t: p.t, cells: o.cells.map((c: any) => [c[0] + p.t[0], c[1] + p.t[1], c[2] + p.t[2]] as [number, number, number]) };
        }));
      },
      onDone: () => {},
    }).resume();
  });
  out(`${puz}: full solution has ${sol.length} pieces`);

  const timeDLX = (subCells: [number, number, number][], pids: string[]) => {
    const pre = eng.engine2Precompute({ cells: subCells, id: 'sub' }, db);
    const bb = eng.buildBitboards(pre);
    const remaining: Record<string, number> = {}; for (const p of pids) remaining[p] = 1;
    const t0 = performance.now();
    const r = dlxMod.dlxExactCover({ open: bb.occAllMask, remaining, bb: bb as any, timeoutMs: 20000, limit: 1, wantWitness: true });
    return { ms: performance.now() - t0, ok: r.feasible };
  };
  const timeDFS = (subCells: [number, number, number][], pids: string[]) => new Promise<{ ms: number; ok: boolean }>((res) => {
    const pre = eng.engine2Precompute({ cells: subCells, id: 'sub' }, db);
    const t0 = performance.now();
    let solved = false;
    eng.engine2Solve(pre, { ...baseSettings(), tailSwitch: tail(false), maxSolutions: 1, seed: 1, timeoutMs: 20000,
      pieces: { allow: pids, inventory: Object.fromEntries(pids.map(p => [p, 1])) } }, {
      onSolution: () => { solved = true; },
      onDone: () => res({ ms: performance.now() - t0, ok: solved }),
    }).resume();
  });

  const rng = (() => { let s = 12345; return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; })();
  const pick = (n: number) => { const a = [...sol]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a.slice(0, n); };

  out('\nK=open cells | DLX median ms | DFS median ms | winner (5 random subsets each)');
  for (const M of [4, 6, 8, 10, 12, 14]) {
    if (M > sol.length) continue;
    const dlxT: number[] = [], dfsT: number[] = [];
    for (let trial = 0; trial < 5; trial++) {
      const held = pick(M);
      const subCells = held.flatMap(h => h.cells);
      const pids = held.map(h => h.pid);
      dlxT.push(timeDLX(subCells, pids).ms);
      dfsT.push((await timeDFS(subCells, pids)).ms);
    }
    const md = median(dlxT), mf = median(dfsT);
    out(`  K=${String(M * 4).padStart(2)} (${M}pc) | DLX ${md.toFixed(1).padStart(8)} | DFS ${mf.toFixed(1).padStart(8)} | ${md < mf ? 'DLX' : 'DFS'} ${(Math.max(md, mf) / Math.max(0.01, Math.min(md, mf))).toFixed(1)}x`);
  }
}

if (stage === 'fullDlx') {
  // Fire the DLX exact-cover tail high up / at the root — it's a complete
  // solver and often beats DFS on packing problems. Long per-call budget.
  out('PYR100 full-DLX (fire tail early), 60s budget:');
  for (const [label, grav] of [['no-gravity', false], ['gravity', true]] as const) {
    for (const th of [60, 80, 100]) {
      const cfg = { ...baseSettings(), randomizeTies: true, gravityConstraints: { enable: grav },
        tailSwitch: { enable: true, dlxThreshold: th, dlxTimeoutMs: 60000 } };
      const r = await runOne('pyr100', cfg, 3, 60000);
      out(`  ${label.padEnd(11)} tail${String(th).padEnd(3)} ${r.solved ? 'SOLVED @ ' + Math.round(r.ttfsMs) + 'ms' : 'unsolved'}  nodes=${r.nodes} bestDepth=${r.bestDepth}/25 dlxCalls=${r.dlxCalls}`);
    }
  }
}

if (stage === 'gravDiag') {
  // Is the pyramid struggling or unsolvable under gravity? Track best depth.
  out('PYR100 diagnostic (60s each), target depth ~25 pieces:');
  for (const [label, grav] of [['no-gravity', false], ['gravity', true]] as const) {
    const cfg = { ...baseSettings(), tailSwitch: tail(48), randomizeTies: true, gravityConstraints: { enable: grav } };
    const r = await runOne('pyr100', cfg, 3, 60000);
    out(`  ${label.padEnd(12)} ${r.solved ? 'SOLVED @ ' + Math.round(r.ttfsMs) + 'ms' : 'unsolved'}  nodes=${r.nodes}  bestDepth=${r.bestDepth}/25  dlxCalls=${r.dlxCalls}`);
  }
}

if (stage === 'gravPyr') {
  // The Hollow Pyramid WITH gravity on. Gravity prunes candidates, which
  // shrinks the tree — may make this "nearly impossible" shape tractable.
  const grav = { gravityConstraints: { enable: true } };
  const mk = (extra: Settings) => ({ ...baseSettings(), ...grav, randomizeTies: true, ...extra });
  const configs = [
    { name: 'tail40+noRestart', settings: mk({ tailSwitch: tail(40) }) },
    { name: 'tail48+noRestart', settings: mk({ tailSwitch: tail(48) }) },
    { name: 'tail64+noRestart', settings: mk({ tailSwitch: tail(64) }) },
    { name: 'tail48+restart2s', settings: mk({ tailSwitch: tail(48), ...restartTime(2) }) },
    { name: 'tail48+restart5s', settings: mk({ tailSwitch: tail(48), ...restartTime(5) }) },
    { name: 'tailOff+noRestart', settings: mk({ tailSwitch: tail(false) }) },
  ];
  await sweep(configs, ['pyr100'], [1, 2, 3], 30000);
}

if (stage === 'hard') {
  // pyr100-class: does anything crack it, and does restart help? Longer budget.
  const mk = (extra: Settings) => ({ ...baseSettings(), tailSwitch: tail(48), randomizeTies: true, ...extra });
  const configs = [
    { name: 'noRestart', settings: mk({}) },
    { name: 'restart1s', settings: mk(restartTime(1)) },
    { name: 'restart3s', settings: mk(restartTime(3)) },
    { name: 'restart8s', settings: mk(restartTime(8)) },
  ];
  await sweep(configs, ['pyr100'], [1, 2, 3], 40000);
}
