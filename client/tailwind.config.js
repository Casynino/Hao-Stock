/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Dark, futuristic surfaces (Meetly-style).
        background: '#0a0a0b',
        surface: '#151517',
        elevated: '#1e1e22',
        border: '#2a2a30',
        foreground: '#f4f4f5',
        muted: '#a1a1aa',
        faint: '#71717a',
        // Accent ramp = lime/green. Low numbers are dark tints (for chips on a
        // dark background); high numbers are the bright accent (buttons, active).
        brand: {
          50: '#16210a',
          100: '#1d2e0c',
          200: '#365314',
          300: '#4d7c0f',
          400: '#84cc16',
          500: '#a3e635',
          600: '#bef264',
          700: '#d9f99d',
          800: '#e9fbc0',
          900: '#f7fee7',
          950: '#fbffe8',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'Avenir', 'Helvetica', 'Arial', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(0,0,0,0.4), 0 8px 24px -12px rgba(0,0,0,0.6)',
        glow: '0 0 0 1px rgba(190,242,100,0.15), 0 8px 30px -8px rgba(132,204,22,0.25)',
      },
    },
  },
  plugins: [],
};
