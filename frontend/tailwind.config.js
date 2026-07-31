/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0B0E14",
        panel: "#11151F",
        panel2: "#161B27",
        line: "#232A3A",
        mint: "#4CE0B3",
        signal: "#5B8CFF",
        warn: "#F2B35C",
        danger: "#F26D6D",
        muted: "#7C8698",
      },
      fontFamily: {
        display: ["'Vazirmatn'", "system-ui", "sans-serif"],
        mono: ["'JetBrains Mono'", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};
