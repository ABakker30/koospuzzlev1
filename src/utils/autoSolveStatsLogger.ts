// src/utils/autoSolveStatsLogger.ts

export type AutoSolveRunStats = {
  timestampIso: string;
  puzzleId: string;
  puzzleName: string;
  mode: 'exhaustive' | 'balanced' | 'fast';
  seed: number;
  timeoutSec: number;
  success: boolean;
  stopReason: 'complete' | 'timeout' | 'limit' | 'canceled' | 'solution';
  timeToSolutionMs: number | null;
  elapsedMs: number;
  nodes: number;
  nodesToSolution: number | null;
  bestPlaced: number;
  totalPiecesTarget: number;
  tailTriggered: boolean;
  tailSize: number;
  restartCount: number;
  shuffleStrategy: string;
  randomizeTies: boolean;
  nodesPerSecAvg: number;
  solutionsFound?: number; // Total solutions found (GPU solver)
};

const STORAGE_KEY = 'solve.autoSolveStats';

export function appendAutoSolveRun(stats: AutoSolveRunStats): void {
  try {
    const runs = getAutoSolveRuns();
    runs.push(stats);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(runs));
    console.log('📊 Auto-solve run stats appended:', stats);
  } catch (err) {
    console.error('Failed to append auto-solve run stats:', err);
  }
}

export function getAutoSolveRuns(): AutoSolveRunStats[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    return JSON.parse(stored);
  } catch (err) {
    console.error('Failed to load auto-solve run stats:', err);
    return [];
  }
}

export function clearAutoSolveRuns(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    console.log('📊 Auto-solve run stats cleared');
  } catch (err) {
    console.error('Failed to clear auto-solve run stats:', err);
  }
}

export function downloadAutoSolveRunsCSV(filename?: string): void {
  const runs = getAutoSolveRuns();
  if (runs.length === 0) {
    console.warn('No auto-solve runs to export');
    return;
  }

  // CSV header
  const headers = [
    'timestampIso',
    'puzzleId',
    'puzzleName',
    'mode',
    'seed',
    'timeoutSec',
    'success',
    'stopReason',
    'timeToSolutionMs',
    'elapsedMs',
    'nodes',
    'nodesToSolution',
    'bestPlaced',
    'totalPiecesTarget',
    'tailTriggered',
    'tailSize',
    'restartCount',
    'shuffleStrategy',
    'randomizeTies',
    'nodesPerSecAvg',
  ];

  // CSV escape helper
  const escapeCSV = (value: any): string => {
    if (value === null || value === undefined || value === '') return '';
    const str = String(value);
    // If contains comma, quote, or newline, wrap in quotes and escape internal quotes
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  // Build CSV rows
  const rows = runs.map(run => 
    headers.map(header => escapeCSV(run[header as keyof AutoSolveRunStats])).join(',')
  );

  // Combine header + rows
  const csv = [headers.join(','), ...rows].join('\n');

  // Download
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', filename || `autosolve-stats-${new Date().toISOString().split('T')[0]}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  console.log(`📊 Downloaded CSV with ${runs.length} runs`);
}
