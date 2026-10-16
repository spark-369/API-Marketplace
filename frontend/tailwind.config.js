/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Central brand palette. Every component references these tokens rather than
        // inventing ad-hoc hex values, so re-theming is a single-file change.
        brand: {
          50: '#eef4ff',
          100: '#d9e5ff',
          200: '#bcd2ff',
          300: '#8eb5ff',
          400: '#598cff',
          500: '#3366ff',
          600: '#1f47f5',
          700: '#1836e1',
          800: '#1a2fb6',
          900: '#1c2e8f',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      spacing: {
        // A few deliberate one-offs that appear repeatedly in layouts.
        18: '4.5rem',
        22: '5.5rem',
      },
      maxWidth: {
        content: '72rem',
      },
      boxShadow: {
        card: '0 1px 3px 0 rgb(0 0 0 / 0.08), 0 1px 2px -1px rgb(0 0 0 / 0.06)',
        raised: '0 4px 12px -2px rgb(0 0 0 / 0.12)',
      },
    },
  },
  plugins: [],
}
