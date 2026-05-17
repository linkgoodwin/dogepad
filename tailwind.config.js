/** @type {import('tailwindcss').Config} */

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    container: {
      center: true,
    },
    extend: {
      colors: {
        doge: {
          gold: "#f59e0b",
          "gold-light": "#fbbf24",
          "gold-dark": "#d97706",
          ember: "#ef4444",
          cyan: "#06b6d4",
          violet: "#8b5cf6",
        },
        neon: {
          green: "#22c55e",
          yellow: "#eab308",
          red: "#ef4444",
        },
        dark: {
          950: "#050508",
          900: "#0a0a10",
          800: "#0f0f18",
          700: "#161622",
          600: "#1e1e2e",
          500: "#28283c",
        },
      },
      fontFamily: {
        display: ["Orbitron", "Inter", "system-ui", "sans-serif"],
        body: ["Inter", "system-ui", "sans-serif"],
      },
      boxShadow: {
        gold: "0 0 20px rgba(245, 158, 11, 0.3)",
        "gold-strong": "0 0 40px rgba(245, 158, 11, 0.5)",
        cyan: "0 0 20px rgba(6, 182, 212, 0.3)",
      },
      animation: {
        "pulse-gold": "pulseGold 2s ease-in-out infinite",
        "fade-in": "fadeIn 0.3s ease-out",
        "slide-up": "slideUp 0.3s ease-out",
        glow: "glow 2s ease-in-out infinite alternate",
        "countdown": "countdown 1s ease-in-out infinite",
      },
      keyframes: {
        pulseGold: {
          "0%, 100%": { boxShadow: "0 0 20px rgba(245, 158, 11, 0.2)" },
          "50%": { boxShadow: "0 0 40px rgba(245, 158, 11, 0.5)" },
        },
        fadeIn: {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        slideUp: {
          from: { opacity: "0", transform: "translateY(10px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        glow: {
          from: { textShadow: "0 0 10px rgba(245, 158, 11, 0.5)" },
          to: { textShadow: "0 0 20px rgba(245, 158, 11, 0.8), 0 0 40px rgba(245, 158, 11, 0.3)" },
        },
        countdown: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.5" },
        },
      },
    },
  },
  plugins: [],
};
