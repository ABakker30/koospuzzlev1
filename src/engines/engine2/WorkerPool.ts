// src/engines/engine2/WorkerPool.ts
// Manages multiple solver workers for parallel search

import type { Engine2Settings, PieceDB } from "./index";
import type { IJK, Placement, StatusV2 } from "../types";
import type { WorkerMessage, WorkerResponse } from "./solver.worker";

export type PoolEvents = {
  onStatus?: (aggregated: AggregatedStatus) => void;
  onSolution?: (placements: Placement[], workerId: number) => void;
  onDone?: (summary: PoolSummary) => void;
};

export type AggregatedStatus = {
  workers: number;
  activeWorkers: number;
  totalNodes: number;
  totalElapsedMs: number;
  bestDepth: number;
  maxDepthReached: number;
  totalMaxDepthHits: number;
  nodesPerSec: number;
  workerStats: WorkerStat[];
};

export type WorkerStat = {
  workerId: number;
  nodes: number;
  depth: number;
  maxDepth: number;
  maxDepthHits: number;
  status: "running" | "done" | "error";
};

export type PoolSummary = {
  totalNodes: number;
  totalElapsedMs: number;
  solutions: number;
  reason: "solution" | "timeout" | "canceled" | "complete";
  winningWorker?: number;
};

export class WorkerPool {
  private workers: Worker[] = [];
  private workerStatus: Map<number, StatusV2> = new Map();
  private workerStats: Map<number, WorkerStat> = new Map();
  private solutionFound = false;
  private canceled = false;
  private doneCount = 0;
  private totalSolutions = 0;
  private startTime = 0;
  private statusInterval: number | null = null;
  private events: PoolEvents;
  
  // Global max depth tracking for proper maxDepthHits aggregation
  private globalMaxDepth = 0;
  private globalMaxDepthHits = 0;

  constructor(
    private numWorkers: number,
    private geometry: IJK[],
    private pieceDB: PieceDB,
    private settings: Engine2Settings,
    events: PoolEvents
  ) {
    this.events = events;
    this.numWorkers = Math.min(numWorkers, navigator.hardwareConcurrency || 4);
  }

  async start(): Promise<void> {
    this.startTime = performance.now();
    this.solutionFound = false;
    this.canceled = false;
    this.doneCount = 0;
    this.totalSolutions = 0;
    this.globalMaxDepth = 0;
    this.globalMaxDepthHits = 0;

    // Serialize PieceDB for transfer
    const pieceDBArray: [string, { id: number; cells: IJK[] }[]][] = [];
    for (const [pid, oris] of this.pieceDB.entries()) {
      pieceDBArray.push([pid, oris]);
    }

    // Spawn workers
    const readyPromises: Promise<void>[] = [];

    for (let i = 0; i < this.numWorkers; i++) {
      const worker = new Worker(
        new URL("./solver.worker.ts", import.meta.url),
        { type: "module" }
      );

      this.workers.push(worker);
      this.workerStats.set(i, {
        workerId: i,
        nodes: 0,
        depth: 0,
        maxDepth: 0,
        maxDepthHits: 0,
        status: "running",
      });

      const readyPromise = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error(`Worker ${i} init timeout`)), 10000);

        worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
          const msg = e.data;

          switch (msg.type) {
            case "ready":
              clearTimeout(timeout);
              resolve();
              break;

            case "status":
              this.handleStatus(msg.workerId, msg.status);
              break;

            case "solution":
              this.handleSolution(msg.workerId, msg.placements);
              break;

            case "done":
              this.handleDone(msg.workerId, msg.summary);
              break;

            case "error":
              clearTimeout(timeout);
              console.error(`Worker ${msg.workerId} error:`, msg.error);
              const stat = this.workerStats.get(msg.workerId);
              if (stat) stat.status = "error";
              reject(new Error(msg.error));
              break;
          }
        };

        worker.onerror = (err) => {
          clearTimeout(timeout);
          console.error(`Worker ${i} error:`, err);
          reject(err);
        };
      });

      readyPromises.push(readyPromise);

      // Send init message
      const initMsg: WorkerMessage = {
        type: "init",
        workerId: i,
        geometry: this.geometry,
        pieceDB: pieceDBArray,
        settings: this.settings,
      };
      worker.postMessage(initMsg);
    }

    // Wait for all workers to be ready
    await Promise.all(readyPromises);

    // Start periodic status aggregation
    this.statusInterval = window.setInterval(() => {
      this.emitAggregatedStatus();
    }, this.settings.statusIntervalMs ?? 1000);

    console.log(`🚀 WorkerPool started with ${this.numWorkers} workers`);
  }

  private handleStatus(workerId: number, status: StatusV2): void {
    this.workerStatus.set(workerId, status);
    
    const stat = this.workerStats.get(workerId);
    if (stat) {
      stat.nodes = status.nodes ?? 0;
      stat.depth = status.depth ?? 0;
      
      // Track worker's bestDepth from its status
      const workerBestDepth = (status as any).bestDepth ?? status.depth ?? 0;
      stat.maxDepth = Math.max(stat.maxDepth, workerBestDepth);
      stat.maxDepthHits = (status as any).maxDepthHits ?? 0;
      
      // Global max depth tracking: reset hits when any worker reaches a new global max
      if (workerBestDepth > this.globalMaxDepth) {
        // New global max reached - reset counter
        this.globalMaxDepth = workerBestDepth;
        this.globalMaxDepthHits = stat.maxDepthHits;
      } else if (workerBestDepth === this.globalMaxDepth) {
        // Worker is at current global max - we'll aggregate in emitAggregatedStatus
      }
    }
  }

  private handleSolution(workerId: number, placements: Placement[]): void {
    if (this.solutionFound) return; // Already found one
    
    this.solutionFound = true;
    this.totalSolutions++;
    
    console.log(`🎉 Worker ${workerId} found a solution!`);
    
    // Notify listener
    this.events.onSolution?.(placements, workerId);
    
    // Cancel all workers
    this.cancelAll();
    
    // Emit final summary
    this.emitDoneSummary("solution", workerId);
  }

  private handleDone(workerId: number, summary: { solutions: number; nodes: number; elapsedMs: number; reason: string }): void {
    const stat = this.workerStats.get(workerId);
    if (stat) {
      stat.status = "done";
      stat.nodes = summary.nodes;
    }

    this.doneCount++;
    this.totalSolutions += summary.solutions;

    // Check if all workers are done
    if (this.doneCount >= this.numWorkers && !this.solutionFound) {
      const reason = this.canceled ? "canceled" : 
                     summary.reason === "timeout" ? "timeout" : "complete";
      this.emitDoneSummary(reason as PoolSummary["reason"]);
    }
  }

  private emitAggregatedStatus(): void {
    const elapsed = performance.now() - this.startTime;
    let totalNodes = 0;
    let bestDepth = 0;
    let maxDepthReached = 0;
    let totalMaxDepthHits = 0;
    let activeWorkers = 0;

    const workerStats: WorkerStat[] = [];
    
    for (const [, stat] of this.workerStats.entries()) {
      totalNodes += stat.nodes;
      bestDepth = Math.max(bestDepth, stat.depth);
      maxDepthReached = Math.max(maxDepthReached, stat.maxDepth);
      // Only count hits from workers that have reached the global max depth
      if (stat.maxDepth === this.globalMaxDepth) {
        totalMaxDepthHits += stat.maxDepthHits;
      }
      if (stat.status === "running") activeWorkers++;
      workerStats.push({ ...stat });
    }

    const aggregated: AggregatedStatus = {
      workers: this.numWorkers,
      activeWorkers,
      totalNodes,
      totalElapsedMs: elapsed,
      bestDepth,
      maxDepthReached: this.globalMaxDepth, // Use tracked global max
      totalMaxDepthHits,
      nodesPerSec: elapsed > 0 ? Math.round(totalNodes / (elapsed / 1000)) : 0,
      workerStats,
    };

    this.events.onStatus?.(aggregated);
  }

  private emitDoneSummary(reason: PoolSummary["reason"], winningWorker?: number): void {
    if (this.statusInterval) {
      clearInterval(this.statusInterval);
      this.statusInterval = null;
    }

    let totalNodes = 0;
    for (const stat of this.workerStats.values()) {
      totalNodes += stat.nodes;
    }

    const summary: PoolSummary = {
      totalNodes,
      totalElapsedMs: performance.now() - this.startTime,
      solutions: this.totalSolutions,
      reason,
      winningWorker,
    };

    this.events.onDone?.(summary);
  }

  pause(): void {
    for (const worker of this.workers) {
      worker.postMessage({ type: "pause" } as WorkerMessage);
    }
  }

  resume(): void {
    for (const worker of this.workers) {
      worker.postMessage({ type: "resume" } as WorkerMessage);
    }
  }

  cancel(): void {
    this.canceled = true;
    this.cancelAll();
  }

  private cancelAll(): void {
    for (const worker of this.workers) {
      worker.postMessage({ type: "cancel" } as WorkerMessage);
    }
  }

  terminate(): void {
    if (this.statusInterval) {
      clearInterval(this.statusInterval);
      this.statusInterval = null;
    }
    
    for (const worker of this.workers) {
      worker.terminate();
    }
    this.workers = [];
    this.workerStats.clear();
    this.workerStatus.clear();
  }

  getWorkerCount(): number {
    return this.numWorkers;
  }

  static getAvailableCores(): number {
    return navigator.hardwareConcurrency || 4;
  }
}
