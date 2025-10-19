import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { tokens } from "../../styles/tokens";
import { useAuth } from "../../auth/AuthContext";
import { InfoModal } from "../../components/InfoModal";
import { HomePreviewCanvas } from "../../components/HomePreviewCanvas";

export default function HomeVariantC() {
  const navigate = useNavigate();
  const { isLoggedIn, login, logout } = useAuth();
  const [hover, setHover] = useState<string | null>(null);
  const [showAbout, setShowAbout] = useState(false);

  const steps = [
    { title: "Choose Your Puzzle Shape", desc: "Load a puzzle shape or start creating your own.", link: "/shape" },
    { title: "View & Share", desc: "Explore finished puzzles or share your creations.", link: "/studio" },
  ] as const;

  return (
    <div style={{ minHeight: "100vh", background: tokens.color.bg }}>
      <style>{`
        .kc-wrap {
          max-width: 1200px;
          margin: 0 auto;
          padding: 0 ${tokens.space(4)} ${tokens.space(8)};
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: ${tokens.space(6)};
          align-items: start;
        }
        
        .kc-left {
          display: flex;
          flex-direction: column;
          margin: 0;
          padding: 0;
        }
        
        .kc-right {
          position: sticky;
          top: 80px;
          margin: 0 !important;
          padding: 0 !important;
          display: block !important;
        }
        
        .kc-right > * {
          margin-top: 0 !important;
          padding-top: 0 !important;
        }
        
        .kc-left > *:first-child {
          margin-top: 0;
        }
        
        .kc-right > *:first-child {
          margin-top: 0;
        }
        
        .kc-cards {
          margin-top: 0 !important;
          padding-top: 0 !important;
        }
        
        .kc-preview {
          height: fit-content;
          min-height: 400px;
          margin-top: 0 !important;
          padding-top: 0 !important;
        }
        
        @media (max-width: 768px) {
          .kc-hero-header {
            padding: ${tokens.space(4)} ${tokens.space(3)} ${tokens.space(3)} !important;
          }
          
          .kc-wrap {
            grid-template-columns: 1fr;
            padding: 0 ${tokens.space(3)} ${tokens.space(4)};
            gap: ${tokens.space(3)};
          }
          
          .kc-left {
            margin-bottom: ${tokens.space(3)};
          }
          
          .kc-right {
            position: relative;
            top: 0;
            margin-top: -${tokens.space(4)};
          }
          
          .kc-preview {
            min-height: 280px !important;
            max-height: 350px;
          }
        }
      `}</style>
      {/* Top bar */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          display: "flex",
          justifyContent: "flex-end",
          alignItems: "center",
          gap: 8,
          padding: "8px 16px",
          background: "rgba(255,255,255,0.6)",
          backdropFilter: "blur(10px)",
          borderBottom: `1px solid ${tokens.color.line}`,
        }}
      >
        <button
          onClick={() => setShowAbout(true)}
          title="About KOOS Puzzle"
          style={{
            height: "2.25rem",
            minWidth: "2.25rem",
            padding: 0,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "monospace",
            fontSize: "1.1rem",
            borderRadius: 10,
            border: `1px solid ${tokens.color.accentSoft}`,
            background: "#fff",
            boxShadow: tokens.shadow,
            cursor: "pointer",
          }}
        >
          ℹ
        </button>

        <button
          onClick={isLoggedIn ? logout : login}
          style={{
            height: "2.25rem",
            padding: "0 12px",
            borderRadius: 10,
            border: "none",
            background:
              "linear-gradient(90deg, #2f6ff4 0%, #1f4fb5 100%)",
            color: "#fff",
            fontWeight: 600,
            boxShadow: "0 6px 20px rgba(47,111,244,0.25)",
            cursor: "pointer",
          }}
        >
          {isLoggedIn ? "Logout" : "Login"}
        </button>
      </div>

      {/* HERO above the grid */}
      <header className="kc-hero-header" style={{
        maxWidth: 1200,
        margin: '0 auto',
        padding: `${tokens.space(8)} ${tokens.space(4)} ${tokens.space(6)}`,
      }}>
        <h1 className="koos-title" style={{ margin: 0 }}>
          KOOS Puzzle
        </h1>
        <p style={{ color: tokens.font.sub, marginTop: tokens.space(1) }}>
          Discover. Solve. Share.
        </p>
      </header>

      <div className="kc-wrap">
        {/* LEFT: cards */}
        <section className="kc-left">
          <div className="kc-cards" style={{ display: "grid", gap: tokens.space(4) }}>
            {steps.map((s) => (
              <div
                key={s.title}
                className="kc-card"
                onMouseEnter={() => setHover(s.title)}
                onMouseLeave={() => setHover(null)}
                onClick={() => s.link && navigate(s.link)}
                style={{
                  position: "relative",
                  borderRadius: tokens.radius,
                  background: tokens.color.card,
                  boxShadow: tokens.shadow,
                  padding: tokens.space(5),
                  display: "flex",
                  flexDirection: "column",
                  gap: tokens.space(1),
                  borderLeft:
                    hover === s.title ? `4px solid ${tokens.color.accent}` : "4px solid transparent",
                  transition: "border-color .3s ease, transform .3s ease",
                  transform: hover === s.title ? "translateX(2px)" : "none",
                  cursor: s.link ? "pointer" : "default",
                }}
              >
                <span className="kc-halo" />
                <div style={{ fontWeight: 600 }}>{s.title}</div>
                <div style={{ color: tokens.font.sub }}>{s.desc}</div>
              </div>
            ))}
          </div>
          <div style={{ height: tokens.space(4) }} />
          <div
            style={{
              color: tokens.font.sub,
              fontWeight: 500,
              fontSize: "1rem",
              marginTop: tokens.space(2),
            }}
          >
            Your puzzle journey begins here.
          </div>
        </section>

        {/* RIGHT: preview */}
        <aside className="kc-right" style={{ margin: 0, padding: 0 }}>
          <div
            className="kc-preview"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              borderRadius: tokens.radius * 1.3,
              background: "#f0f0f0",
              boxShadow: "inset 0 0 40px rgba(47,111,244,0.05)",
              outline: `1px dashed ${tokens.color.accentSoft}`,
              outlineOffset: -10,
              overflow: "hidden",
              margin: 0,
              padding: 0,
              display: "block",
            }}
          >
            <HomePreviewCanvas />
          </div>
        </aside>
      </div>

      {/* About Modal */}
      <InfoModal
        isOpen={showAbout}
        title="About KOOS Puzzle"
        onClose={() => setShowAbout(false)}
      >
          <div style={{ display: "grid", gap: 10 }}>
            <p>
              KOOS Puzzle is a geometry-driven puzzle experience inspired by
              lattice structures and perspective. Choose a shape, solve it
              manually or automatically, and share the results as UGC.
            </p>
            <p>
              Edit happens inside the flow: pick a shape, then optionally make
              your own variant before solving. We keep the first screen calm and
              clear — just start puzzling.
            </p>
            <ul style={{ margin: 0, paddingLeft: "1.1rem" }}>
              <li>Choose your puzzle shape</li>
              <li>Solve: manual or auto</li>
              <li>View & share your creation</li>
            </ul>
            <p style={{ color: tokens.font.note, fontSize: ".9rem" }}>
              Tip: The preview panel will feature community puzzles and
              animations.
            </p>
          </div>
      </InfoModal>

      {/* Styles: grid areas, sticky preview, column divider glow, mobile halos */}
      <style>{`
        @keyframes metalShift {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }

        /* Title gradient */
        .koos-title {
          display: inline-block;
          font-size: 2rem;
          font-weight: 600;
          line-height: 1.15;
          background: linear-gradient(90deg, #0f172a, #2f6ff4, #0f172a);
          background-size: 300% 100%;
          background-clip: text;
          -webkit-background-clip: text;
          color: transparent;
          -webkit-text-fill-color: transparent;
          animation: metalShift 20s ease-in-out infinite;
        }

        /* --- GRID AREAS --- */
        .kc-wrap {
          max-width: 1320px;
          margin: 0 auto;
          padding: 32px;
          display: grid;
          row-gap: 24px;
          column-gap: 24px;
          grid-template-columns: 1fr;
          grid-template-areas:
            "hero"
            "left"
            "right";
        }

        /* desktop: two columns, hero spans both */
        @media (min-width: 1100px) {
          .kc-wrap {
            grid-template-columns: 0.54fr 0.46fr;
            grid-template-areas:
              "hero hero"
              "left right";
            align-items: start;
          }
        }

        /* area assignments */
        .kc-hero { grid-area: hero; }
        .kc-left { grid-area: left; }
        .kc-right { grid-area: right; }

        /* sticky preview and subtle column divider glow */
        @media (min-width: 1100px) {
          .kc-preview { position: sticky; top: 92px; min-height: 400px; }
          .kc-wrap { position: relative; }
          .kc-wrap::before {
            content: "";
            position: absolute;
            top: 0; bottom: 0; left: 54%;
            width: 1px;
            background: linear-gradient(180deg, transparent, rgba(47,111,244,.12), transparent);
            filter: blur(.5px);
            transform: translateX(-.5px);
            pointer-events: none;
          }
        }

        /* mobile halos behind cards (fun, gentle color) */
        .kc-card { position: relative; overflow: hidden; }
        .kc-card .kc-halo {
          position: absolute;
          inset: -30% -10% auto -10%;
          height: 60%;
          background:
            radial-gradient(60% 60% at 20% 40%, rgba(47,111,244,0.14), transparent 70%),
            radial-gradient(60% 60% at 80% 30%, rgba(120,173,255,0.14), transparent 70%);
          z-index: 0; pointer-events: none;
        }
        .kc-card > * { position: relative; z-index: 1; }

        /* respect reduced motion */
        @media (prefers-reduced-motion: reduce) { .koos-title { animation: none !important; } }
      `}</style>
    </div>
  );
}
