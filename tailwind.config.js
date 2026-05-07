/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['DM Sans', 'system-ui', 'sans-serif'],
        mono: ['DM Mono', 'monospace'],
      },
      colors: {
        accent: {
          DEFAULT: '#1a1a18',
          fg: '#f5f4f0',
        },
        surface: {
          DEFAULT: '#ffffff',
          2: '#f0efe9',
          3: '#f5f4f0',
        },
        green: {
          DEFAULT: '#1a7a4a',
          bg: '#e8f5ee',
          dark: '#4ade80',
          'dark-bg': '#0d2e1a',
        },
        red: {
          DEFAULT: '#c0392b',
          bg: '#fdecea',
          dark: '#f87171',
          'dark-bg': '#2e0d0d',
        },
        amber: {
          DEFAULT: '#996600',
          bg: '#fdf3dc',
          dark: '#fbbf24',
          'dark-bg': '#2e1f00',
        },
        blue: {
          DEFAULT: '#1a5fa8',
          bg: '#e8f0fb',
          dark: '#60a5fa',
          'dark-bg': '#0d1e35',
        },
      },
    },
  },
  plugins: [],
}
