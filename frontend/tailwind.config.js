/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0D1210",
        panel: "#131A17",
        panel2: "#19231E",
        line: "#2B3932",
        mint: "#68D7A7",
        signal: "#C6F36A",
        warn: "#F0A45D",
        danger: "#F27368",
        muted: "#95A49D",
      },
      fontFamily: {
        display: ["'Vazirmatn'", "system-ui", "sans-serif"],
        mono: ["'JetBrains Mono'", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};
