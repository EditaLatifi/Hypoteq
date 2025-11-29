import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#0F3E8C",
          50: "#EEF3FC",
          100: "#D9E5FA",
          200: "#B5CCF5",
          300: "#8BB0EE",
          400: "#5A8FE5",
          500: "#2D71DB",
          600: "#185AC2",
          700: "#0F3E8C",
          800: "#0C2F69",
          900: "#0A244F",
        },
      },
      borderRadius: {
        xl: "0.75rem",
        "2xl": "1rem",
      },
      boxShadow: {
        card: "0 6px 18px rgba(0,0,0,0.06)",
      },
      fontFamily: {
        sfpro: ['"SF Pro Display"','Inter',  "sans-serif"], 
      },
    },
  },
  plugins: [],
};

export default config;
