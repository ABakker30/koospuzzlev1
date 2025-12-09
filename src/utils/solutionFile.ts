// src/utils/solutionFile.ts
import type { Placement } from "../engines/types";

export function saveSolutionToFile(
  payload: {
    index: number;
    placements: Placement[];
    containerId?: string;
    nodes: number;
    elapsedMs: number;
  }
) {
  const { index, placements, containerId, nodes, elapsedMs } = payload;
  const solutionData = {
    solution_number: index,
    timestamp: new Date().toISOString(),
    container_id: containerId,
    nodes_explored: nodes,
    elapsed_ms: elapsedMs,
    pieces_placed: placements.length,
    placements: placements.map(p => ({
      piece_id: p.pieceId,
      orientation: p.ori,
      position: { i: p.t[0], j: p.t[1], k: p.t[2] },
    })),
  };

  const jsonStr = JSON.stringify(solutionData, null, 2);
  const blob = new Blob([jsonStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `solution_${String(index).padStart(3, "0")}_${containerId ?? "container"}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
