/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: '#05100a',
          panel: '#0a1a12',
          card: '#0d2117',
          raised: '#11291d',
        },
        brand: {
          50: '#e8fff3',
          100: '#c6ffe1',
          200: '#8dffc3',
          300: '#4bf59f',
          400: '#22d684',
          500: '#0fb86d',
          600: '#0a9459',
          700: '#0a7549',
          800: '#0b5c3c',
          900: '#0a4a32',
          950: '#042a1c',
        },
        line: '#143826',
        ink: {
          DEFAULT: '#e6fbf1',
          dim: '#8fb8a4',
          faint: '#4f7261',
        },
        warn: '#f5b942',
        danger: '#ff5c5c',
        vip: '#c8a8ff',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(15,184,109,0.25), 0 0 24px -4px rgba(15,184,109,0.35)',
      },
    },
  },
  plugins: [],
}
