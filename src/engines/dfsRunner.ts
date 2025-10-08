// Status replayer (so UI works before DFS is wired)

import { StatusV2 } from "./types";

export type RunnerEvents = {
  onStatus: (s: StatusV2) => void;
  onDone: (summary: { solutions: number; elapsedMs: number }) => void;
};

export function startStatusReplayer(frames: StatusV2[], ev: RunnerEvents) {
  const t0 = performance.now();
  let i = 0;
  
  function tick() {
    if (i >= frames.length) {
      ev.onDone({ solutions: 0, elapsedMs: performance.now() - t0 });
      return;
    }
    ev.onStatus(frames[i++]);
    setTimeout(tick, 100); // ~10 fps
  }
  
  tick();
}
