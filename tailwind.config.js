/** @type {import('tailwindcss').Config} */
export default {
  content: ["./client/index.html", "./client/src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        velvet: "#020504",
        lounge: "#06140f",
        felt: { DEFAULT: "#0e5c46", deep: "#073829", light: "#1a7a5e" },
        gold: { DEFAULT: "#d9b45a", soft: "#b8964a", pale: "#f3e6c4" },
        ruby: "#c0334a",
      },
      fontFamily: {
        marquee: ['"Limelight"', "serif"],
        sans: ['"Outfit"', "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
