export const tokens = {
  radius: 12,
  shadow: "0 6px 24px rgba(0,0,0,0.06)",
  font: {
    heading: 600,
    sub: "#64748b",
    note: "#94a3b8",
    dark: "#0f172a",
  },
  color: {
    bg: "linear-gradient(180deg, #f7faff 0%, #ecf2ff 60%, #f8f9fb 100%)",
    card: "#ffffff",
    line: "#e5e7eb",
    accent: "#2f6ff4",
    accentSoft: "#e2ecff",
    haloA: "rgba(47, 111, 244, 0.14)",  // mobile halo
    haloB: "rgba(120, 173, 255, 0.14)",
  },
  space: (n: number) => `${n * 4}px`,
};
