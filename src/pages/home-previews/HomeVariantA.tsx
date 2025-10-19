import type React from "react";
import { tokens } from "../../styles/tokens";

export default function HomeVariantA() {
  const card = {
    borderRadius: tokens.radius,
    background: tokens.color.card,
    boxShadow: tokens.shadow,
    padding: tokens.space(5),
    display: "flex",
    flexDirection: "column" as const,
    gap: tokens.space(2),
  };
  const grid: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: tokens.space(4),
    width: "100%",
    maxWidth: 960,
    margin: "0 auto",
  };

  return (
    <div style={{ minHeight: "100vh", background: `linear-gradient(${tokens.color.bg}, #eef2f7)` }}>
      <div style={{ maxWidth: 1080, margin: "0 auto", padding: `${tokens.space(8)} ${tokens.space(4)}` }}>
        <h1 style={{ textAlign: "center", margin: 0, fontWeight: tokens.font.heading }}>KOOS Puzzle</h1>
        <p style={{ textAlign: "center", color: tokens.font.sub, marginTop: tokens.space(1) }}>
          Discover. Solve. Share.
        </p>

        <div style={{ height: tokens.space(6) }} />

        <div style={grid}>
          <div style={card}>
            <div style={{ fontWeight: 600 }}>Choose Shape</div>
            <div style={{ color: tokens.font.sub }}>Start with a container.</div>
          </div>
          <div style={card}>
            <div style={{ fontWeight: 600 }}>Use or Edit</div>
            <div style={{ color: tokens.font.sub }}>Add/remove 4-sphere pieces.</div>
          </div>
          <div style={card}>
            <div style={{ fontWeight: 600 }}>Solve</div>
            <div style={{ color: tokens.font.sub }}>Manual steps or auto solver.</div>
          </div>
          <div style={card}>
            <div style={{ fontWeight: 600 }}>View & Share</div>
            <div style={{ color: tokens.font.sub }}>Playback and UGC export.</div>
          </div>
        </div>

        <div style={{ height: tokens.space(7) }} />
        <div style={{ textAlign: "center", color: tokens.font.note, fontSize: ".9rem" }}>
          Your shapes. Your symmetry.
        </div>
      </div>
    </div>
  );
}
