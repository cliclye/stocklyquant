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
        // Using rgb(var(--x) / <alpha-value>) so Tailwind opacity modifiers work (e.g. bg-primary/10)
        background:          "rgb(var(--background) / <alpha-value>)",
        surface:             "rgb(var(--surface) / <alpha-value>)",
        "surface-highlight": "rgb(var(--surface-highlight) / <alpha-value>)",
        // Border: default opacity 0.08 via the function callback form
        border: ({ opacityValue }: { opacityValue: string | undefined }) =>
          `rgb(var(--border) / ${opacityValue ?? "0.08"})`,
        primary:             "rgb(var(--primary) / <alpha-value>)",
        secondary:           "rgb(var(--secondary) / <alpha-value>)",
        success:             "rgb(var(--success) / <alpha-value>)",
        danger:              "rgb(var(--danger) / <alpha-value>)",
        warning:             "rgb(var(--warning) / <alpha-value>)",
        "text-primary":      "rgb(var(--text-primary) / <alpha-value>)",
        "text-secondary":    "rgb(var(--text-secondary) / <alpha-value>)",
      },
      animation: {
        "fade-in": "fadeIn 0.3s ease-out forwards",
        "slide-up": "slideUp 0.4s ease-out forwards",
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
