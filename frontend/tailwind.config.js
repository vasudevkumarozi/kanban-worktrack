/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#fdf0f4',
          100: '#fad9e6',
          200: '#f4b3cb',
          300: '#e8809f',
          400: '#C04878',
          500: '#AC2660',
          600: '#8A1748',
          700: '#6b1038',
          800: '#4d0a28',
          900: '#2e0618',
        },
      },
    },
  },
  plugins: [],
};
