import type React from "react";
import { tokens } from "../../styles/tokens";

export default function HomeVariantB() {
  const step: React.CSSProperties = {
    borderRadius: tokens.radius,
    background: tokens.color.card,
    boxShadow: tokens.shadow,
    padding: `${tokens.space(4)} ${tokens.space(5)}`,
    display: "flex",
    alignItems: "center",
    gap: tokens.space(3),
  };

  return (
    <div style={{ minHeight: "100vh", background: tokens.color.bg }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: `${tokens.space(8)} ${tokens.space(4)}` }}>
        <div
          style={{
            borderRadius: tokens.radius + 4,
            background: `linear-gradient(180deg, ${tokens.color.card}, #f2f5fb)`,
            boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
            padding: `${tokens.space(8)} ${tokens.space(5)}`,
            textAlign: "center",
          }}
        >
          <h1 style={{ margin: 0, fontWeight: tokens.font.heading }}>KOOS Puzzle</h1>
          <p style={{ color: tokens.font.sub, marginTop: tokens.space(1) }}>
            Perspective begins with exploration.
          </p>
          <div
            style={{
              margin: `${tokens.space(5)} auto 0`,
              width: "min(720px, 95%)",
              height: 180,
              borderRadius: tokens.radius,
              background: "radial-gradient(120% 120% at 30% 20%, #e8eef9 0%, #f7f9ff 40%, #ffffff 100%)",
              outline: "1px dashed #c9d3ea",
              outlineOffset: -8,
            }}
          />
        </div>

        <div style={{ height: tokens.space(6) }} />

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: tokens.space(4) }}>
          {[
            ["1.", "Choose Shape", "Pick a container to begin."],
            ["2.", "Use or Edit", "Add/remove pieces (4 spheres)."],
            ["3.", "Solve", "Manual moves or auto solver."],
            ["4.", "View & Share", "Playback and UGC export."],
          ].map(([n, t, s]) => (
            <div key={t} style={step}>
              <span style={{ fontFamily: "monospace", fontSize: "1.1rem" }}>{n}</span>
              <div>
                <div style={{ fontWeight: 600 }}>{t}</div>
                <div style={{ color: tokens.font.sub }}>{s}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ height: tokens.space(5) }} />
        <p style={{ textAlign: "center", color: tokens.font.note, fontSize: ".9rem" }}>
          Continue where you left off.
        </p>
      </div>
    </div>
  );
}
