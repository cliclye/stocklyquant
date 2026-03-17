import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: "#22d3ee",       // cyan-400
        warning: "#fbbf24",       // amber-400
        surface: {
          DEFAULT:   "#0f172a",   // slate-900
          highlight: "#1e293b",   // slate-800
        },
        border: {
          DEFAULT: "#1e293b",     // slate-800
        },
        background: "#020617",    // slate-950
        text: {
          primary:   "#f1f5f9",   // slate-100
          secondary: "#94a3b8",   // slate-400
        },
      },
      animation: {
        "fade-in":    "fadeIn 0.25s ease-out forwards",
        "slide-up":   "slideUp 0.3s ease-out forwards",
        "spin-slow":  "spin 1.5s linear infinite",
        "pulse-slow": "pulse 3s ease-in-out infinite",
      },
    },
  },
  safelist: [
    // SCORE_CONFIG dynamic gradient / text classes
    "from-emerald-500", "to-green-400",
    "from-green-500",   "to-teal-400",
    "from-yellow-500",  "to-amber-400",
    "from-orange-500",  "to-amber-500",
    "from-red-500",     "to-rose-500",
    "text-emerald-400", "text-green-400", "text-yellow-400",
    "text-orange-400",  "text-red-400",
    // FORMULA_STYLES / RISK_STYLES badge classes
    "bg-blue-500/10",    "text-blue-400",    "border-blue-500/20",
    "bg-teal-500/10",    "text-teal-400",    "border-teal-500/20",
    "bg-purple-500/10",  "text-purple-400",  "border-purple-500/20",
    "bg-orange-500/10",  "text-orange-400",  "border-orange-500/20",
    "bg-red-500/10",     "text-red-400",     "border-red-500/20",
    "bg-emerald-500/10", "text-emerald-400", "border-emerald-500/20",
    "bg-yellow-500/10",  "text-yellow-400",  "border-yellow-500/20",
    "bg-rose-500/10",    "text-rose-400",    "border-rose-500/20",
    "bg-green-500/10",   "text-green-400",   "border-green-500/20",
    // WeightBar color prop values
    "bg-blue-500", "bg-teal-500", "bg-purple-500",
    "bg-orange-500", "bg-rose-500", "bg-yellow-500",
  ],
  plugins: [],
};

export default config;
