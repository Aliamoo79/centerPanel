/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0B0E19",
        panel: "#111425",
        panel2: "#181D33",
        line: "#2A3150",
        mint: "#52D3B0",
        signal: "#8B7CFF",
        warn: "#F0A45D",
        danger: "#F27368",
        muted: "#9AA3BD",
      },
      fontFamily: {
        display: ["'Vazirmatn'", "system-ui", "sans-serif"],
        mono: ["'JetBrains Mono'", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};
