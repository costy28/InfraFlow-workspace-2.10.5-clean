/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#E1F5EE',
          100: '#C3EBD8',
          500: '#0F6E56',
          600: '#0A5240',
          700: '#073B2E',
        },
        accent: '#1a56db',
      },
    },
  },
  plugins: [],
}
