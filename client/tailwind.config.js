/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#154212',
          container: '#2b5e28',
        },
        secondary: {
          DEFAULT: '#9c4323',
          container: '#c06642',
        },
        tertiary: {
          DEFAULT: '#4b3600',
          container: '#7a5c20',
        },
        surface: {
          DEFAULT: '#fafaf3',
          low: '#f3f3ec',
          container: '#edede6',
          high: '#e7e7e0',
          highest: '#e0e0d9',
        },
        'on-surface': {
          DEFAULT: '#1a1c18',
          variant: '#44473f',
        },
        'on-primary': '#ffffff',
        'on-secondary': '#ffffff',
        'on-tertiary': '#ffffff',
        outline: {
          DEFAULT: '#74796f',
          variant: '#c4c8bd',
        },
        faction: {
          red: '#9c4323',
          blue: '#3b5f7a',
          green: '#154212',
          gold: '#a48a2e',
        },
      },
      fontFamily: {
        sans: ['"Manrope Variable"', 'Manrope', 'system-ui', '-apple-system', 'sans-serif'],
      },
      borderRadius: {
        md: '0.75rem',
        xl: '1.5rem',
      },
      backdropBlur: {
        xl: '24px',
      },
      boxShadow: {
        ambient: '0 8px 32px rgba(26, 28, 24, 0.06)',
      },
      letterSpacing: {
        display: '-0.02em',
      },
    },
  },
  plugins: [],
}
