/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        earth: {
          50: '#fdf8f0',
          100: '#f9edda',
          200: '#f0d5aa',
          300: '#e5b872',
          400: '#d9943a',
          500: '#c97a1e',
          600: '#a85f15',
          700: '#854814',
          800: '#6b3a16',
          900: '#583115',
        },
        leaf: {
          50: '#f2fbf4',
          100: '#e0f5e5',
          200: '#c2eacc',
          300: '#92d8a4',
          400: '#5bbe75',
          500: '#34a254',
          600: '#258342',
          700: '#1f6835',
          800: '#1d532c',
          900: '#194526',
        },
        soil: {
          50: '#faf6f2',
          100: '#f2e9df',
          200: '#e5d1bc',
          300: '#d4b390',
          400: '#bf8f62',
          500: '#b07443',
          600: '#9a6038',
          700: '#7f4d30',
          800: '#68402c',
          900: '#563628',
        },
      },
      fontFamily: {
        display: ['Georgia', 'Cambria', 'serif'],
        body: ['system-ui', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
