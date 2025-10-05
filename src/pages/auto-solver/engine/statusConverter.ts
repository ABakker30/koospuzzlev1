// src/pages/auto-solver/engine/statusConverter.ts
import type { EngineStatus } from './statusTypes';
import type { EngineEvent, EnginePlacement } from './engineTypes';

/**
 * Convert engine status JSON to a series of EngineEvents
 * Creates events for: started, progress, and individual placement_add for each stack entry
 */
export function statusToEvents(status: EngineStatus): EngineEvent[] {
  const events: EngineEvent[] = [];
  
  // 1) Started event
  events.push({
    type: 'started',
    engine: status.engine,
    config: {
      run_id: status.run_id,
      container: status.container.cid
    }
  });
  
  // 2) Add each placement from the stack
  status.stack.forEach((stackEntry, index) => {
    // Convert status cells to engine placement format
    const placement: EnginePlacement = {
      pieceId: stackEntry.piece_label,
      cells_ijk: stackEntry.cells.map(cell => [cell.i, cell.j, cell.k] as [number, number, number])
    };
    
    // Add placement event
    events.push({
      type: 'placement_add',
      placement: placement
    });
    
    // Add progress event after each placement
    events.push({
      type: 'progress',
      progress: {
        nodes: Math.floor(status.metrics.nodes * (index + 1) / status.stack.length),
        depth: index + 1,
        placed: index + 1,
        elapsedMs: Math.floor(status.metrics.elapsed_ms * (index + 1) / status.stack.length)
      }
    });
  });
  
  // 3) Final partial solution event with all placements
  events.push({
    type: 'partial_solution',
    placements: status.stack.map(stackEntry => ({
      pieceId: stackEntry.piece_label,
      cells_ijk: stackEntry.cells.map(cell => [cell.i, cell.j, cell.k] as [number, number, number])
    }))
  });
  
  return events;
}

/**
 * Load status JSON from a file path
 */
export async function loadStatusJson(path: string): Promise<EngineStatus> {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to load status: ${response.statusText}`);
  }
  return response.json();
}
