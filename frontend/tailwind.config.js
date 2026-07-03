/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        darkBase: '#050b14',      // Very dark cyber blue
        darkCard: '#0f172a',      // Dark slate for cards
        primary: '#00f0ff',       // Cyber cyan
        secondary: '#bc13fe',     // Neon purple
        danger: '#ff003c',        // Neon red
        warning: '#ffb700',       // Cyber yellow
        success: '#00ff66',       // Neon green
      },
      fontFamily: {
        inter: ['Inter', 'sans-serif'],
        mono: ['Fira Code', 'monospace'],
      },
      backgroundImage: {
        'cyber-grid': 'linear-gradient(rgba(0, 240, 255, 0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 240, 255, 0.05) 1px, transparent 1px)',
      }
    },
  },
  plugins: [],
}
