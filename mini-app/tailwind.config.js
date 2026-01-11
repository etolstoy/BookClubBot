/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Ubuntu', 'system-ui', '-apple-system', 'sans-serif'],
      },
      colors: {
        tg: {
          bg: "var(--tg-theme-bg-color, #ffffff)",
          text: "var(--tg-theme-text-color, #000000)",
          hint: "var(--tg-theme-hint-color, #999999)",
          link: "var(--tg-theme-text-color, #000000)",
          button: "var(--tg-theme-text-color, #000000)",
          "button-text": "var(--tg-theme-button-text-color, #ffffff)",
          secondary: "var(--tg-theme-secondary-bg-color, #f0f0f0)",
        },
      },
    },
  },
  plugins: [
    function({ addUtilities }) {
      const lineClampUtilities = {
        '.line-clamp-6': {
          overflow: 'hidden',
          display: '-webkit-box',
          '-webkit-box-orient': 'vertical',
          '-webkit-line-clamp': '6',
        },
      };
      addUtilities(lineClampUtilities);
    },
  ],
};
