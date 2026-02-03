// src/engines/engine2/solver.worker.ts
// Web Worker for parallel solver execution

import { engine2Solve, engine2Precompute, type Engine2Settings, type PieceDB } from "./index";
import type { IJK, Placement, StatusV2 } from "../types";

export type WorkerMessage =
  | { type: "init"; workerId: number; geometry: IJK[]; pieceDB: [string, { id: number; cells: IJK[] }[]][]; settings: Engine2Settings }
  | { type: "start" }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "cancel" };

export type WorkerResponse =
  | { type: "ready"; workerId: number }
  | { type: "status"; workerId: number; status: StatusV2 }
  | { type: "solution"; workerId: number; placements: Placement[] }
  | { type: "done"; workerId: number; summary: { solutions: number; nodes: number; elapsedMs: number; reason: string } }
  | { type: "error"; workerId: number; error: string };

let workerId = -1;
let handle: ReturnType<typeof engine2Solve> | null = null;

self.onmessage = (e: MessageEvent<WorkerMessage>) => {
  const msg = e.data;

  switch (msg.type) {
    case "init": {
      workerId = msg.workerId;
      
      // Reconstruct PieceDB from serialized data
      const pieceDB: PieceDB = new Map(msg.pieceDB);
      
      // Create engine with unique seed per worker
      const settings: Engine2Settings = {
        ...msg.settings,
        seed: (msg.settings.seed ?? Date.now()) + workerId * 1000,
      };

      try {
        // Precompute for this worker
        const pre = engine2Precompute(
          { cells: msg.geometry, id: `worker-${workerId}` },
          pieceDB
        );

        handle = engine2Solve(pre, settings, {
          onStatus: (status) => {
            // Extract only serializable fields to avoid postMessage issues
            const safeStatus = {
              nodes: status.nodes ?? 0,
              depth: status.depth ?? 0,
              bestDepth: (status as any).bestDepth ?? status.depth ?? 0,
              maxDepthHits: (status as any).maxDepthHits ?? 0,
              elapsedMs: status.elapsedMs ?? 0,
              nodesPerSec: (status as any).nodesPerSec ?? 0,
              restartCount: status.restartCount ?? 0,
            };
            self.postMessage({ type: "status", workerId, status: safeStatus } as WorkerResponse);
          },
          onSolution: (placements) => {
            self.postMessage({ type: "solution", workerId, placements } as WorkerResponse);
          },
          onDone: (summary) => {
            self.postMessage({ 
              type: "done", 
              workerId, 
              summary: {
                solutions: summary.solutions,
                nodes: summary.nodes,
                elapsedMs: summary.elapsedMs,
                reason: summary.reason,
              }
            } as WorkerResponse);
          },
        });
        
        // Start the solver
        handle.resume();
        
        self.postMessage({ type: "ready", workerId } as WorkerResponse);
      } catch (err) {
        self.postMessage({ 
          type: "error", 
          workerId, 
          error: err instanceof Error ? err.message : String(err) 
        } as WorkerResponse);
      }
      break;
    }

    case "pause": {
      handle?.pause();
      break;
    }

    case "resume": {
      handle?.resume();
      break;
    }

    case "cancel": {
      handle?.cancel();
      break;
    }
  }
};
