/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#effcf5',
          100: '#d5f5e6',
          200: '#aeead1',
          300: '#78dbb7',
          400: '#36c99b',
          500: '#08a77e',
          600: '#008565',
          700: '#006c53',
          800: '#075541',
          900: '#084636',
          950: '#02291f',
        },
        accent: '#1a56db',
      },
    },
  },
  plugins: [],
}
