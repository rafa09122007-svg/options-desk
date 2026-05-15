import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: "#0c0a08",      // deepest bg
          surface: "#161310",       // panels
          card: "#1f1b17",          // cards
          elevated: "#28231e",      // hover state
        },
        edge: {
          DEFAULT: "#2d2823",       // borders
          strong: "#3d3630",        // emphasized borders
        },
        paper: {
          DEFAULT: "#ebe4d6",       // primary text (warm off-white)
          muted: "#a59a85",         // secondary text
          faint: "#6b6155",         // tertiary
        },
        bull: {
          DEFAULT: "#5fbf80",       // muted green, not lime
          glow: "rgba(95, 191, 128, 0.15)",
        },
        bear: {
          DEFAULT: "#e06464",       // softer red
          glow: "rgba(224, 100, 100, 0.15)",
        },
        gold: {
          DEFAULT: "#c9a85a",       // for best_idea / high conviction
          glow: "rgba(201, 168, 90, 0.15)",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
