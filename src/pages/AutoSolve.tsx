// Auto-Solve Page

import { useRef, useState } from "react";
import * as THREE from "three";
import SolveViewer from "../viewer/SolveViewer";
import { LegacyContainer, StatusV2 } from "../engines/types";
import { getCells } from "../engines/adapters";
import { startStatusReplayer } from "../engines/dfsRunner";

export default function AutoSolvePage() {
  const [containerCells, setContainerCells] = useState<[number, number, number][]>([]);
  const [worldFromIJK, setWorldFromIJK] = useState<number[]>(
    new THREE.Matrix4().identity().toArray()
  );
  const [sphereRadius] = useState<number>(1); // legacy default
  const [status, setStatus] = useState<StatusV2 | undefined>(undefined);
  const [isReplaying, setIsReplaying] = useState(false);
  const framesRef = useRef<StatusV2[]>([]);

  function onLoadContainer(json: LegacyContainer) {
    const cells = getCells(json);
    setContainerCells(cells as [number, number, number][]);
    // Use identity matrix - viewer will handle IJK->XYZ conversion
    setWorldFromIJK(new THREE.Matrix4().identity().toArray());
    console.log(`✅ Loaded container with ${cells.length} cells`);
  }

  function onLoadStatus(frames: StatusV2[]) {
    framesRef.current = frames;
    console.log(`✅ Loaded ${frames.length} status frames`);
  }

  function startReplayer() {
    if (!framesRef.current.length) {
      alert("Please load status frames first");
      return;
    }
    setIsReplaying(true);
    startStatusReplayer(framesRef.current, {
      onStatus: s => setStatus(s),
      onDone: summary => {
        setIsReplaying(false);
        console.log(`✅ Replay done: ${summary.solutions} solutions in ${summary.elapsedMs}ms`);
      }
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <div
        style={{
          padding: ".75rem 1rem",
          borderBottom: "1px solid #eee",
          background: "#fff",
          display: "flex",
          alignItems: "center",
          gap: "1rem",
          flexWrap: "wrap"
        }}
      >
        <label style={{ display: "flex", alignItems: "center", gap: ".5rem" }}>
          <span style={{ fontSize: 14, color: "#666" }}>Container:</span>
          <input
            type="file"
            accept=".json"
            onChange={async e => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                const json = JSON.parse(await f.text());
                onLoadContainer(json);
              } catch (err) {
                alert(`Error loading container: ${err}`);
              }
            }}
            style={{ fontSize: 14 }}
          />
        </label>

        <label style={{ display: "flex", alignItems: "center", gap: ".5rem" }}>
          <span style={{ fontSize: 14, color: "#666" }}>Status:</span>
          <input
            type="file"
            accept=".json"
            onChange={async e => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                const json = JSON.parse(await f.text());
                const frames = Array.isArray(json) ? json : [json];
                onLoadStatus(frames as StatusV2[]);
              } catch (err) {
                alert(`Error loading status: ${err}`);
              }
            }}
            style={{ fontSize: 14 }}
          />
        </label>

        <button
          className="btn"
          onClick={startReplayer}
          disabled={isReplaying || !framesRef.current.length}
          style={{ fontSize: 14 }}
        >
          {isReplaying ? "⏸️ Replaying..." : "▶️ Start Replay"}
        </button>

        {status && (
          <span style={{ color: "#666", fontSize: 14, marginLeft: "auto" }}>
            Placed: {status.placed ?? status.stack?.length ?? 0} | Nodes:{" "}
            {status.nodes ?? 0} | Depth: {status.depth ?? 0} | Time:{" "}
            {((status.elapsedMs ?? 0) / 1000).toFixed(1)}s
          </span>
        )}
      </div>

      <div style={{ flex: 1, position: "relative" }}>
        {containerCells.length > 0 ? (
          <SolveViewer
            containerCells={containerCells}
            worldFromIJK={worldFromIJK}
            sphereRadius={sphereRadius}
            status={status}
            emptiesGlass
          />
        ) : (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              color: "#999",
              fontSize: 16
            }}
          >
            Load a container to begin
          </div>
        )}
      </div>
    </div>
  );
}
