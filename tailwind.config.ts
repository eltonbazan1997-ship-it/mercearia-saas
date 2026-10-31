import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./hooks/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        mono: ["Courier New", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      keyframes: {
        "stock-pulse": {
          "0%, 100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.55", transform: "scale(1.12)" },
        },
      },
      animation: {
        "stock-pulse": "stock-pulse 1.1s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
