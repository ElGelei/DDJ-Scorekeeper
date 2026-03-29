import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        gold: {
          DEFAULT: '#C9A84C',
          light: '#E8C97A',
          dark: '#9A6E2A',
        },
        crimson: {
          DEFAULT: '#8B0000',
          light: '#B22222',
        },
        ink: {
          DEFAULT: '#0a0a0a',
          light: '#1a1a1a',
          mid: '#2a2a2a',
          surface: '#141414',
        },
        parchment: '#F5F0E8',
      },
      fontFamily: {
        chinese: ['Ma Shan Zheng', 'cursive'],
        display: ['Cinzel Decorative', 'serif'],
        body: ['Spectral', 'Georgia', 'serif'],
      },
      backgroundImage: {
        'gold-gradient': 'linear-gradient(135deg, #9A6E2A, #C9A84C, #E8C97A, #C9A84C)',
        'crimson-gradient': 'linear-gradient(135deg, #5a0000, #8B0000, #B22222)',
        'dark-gradient': 'linear-gradient(180deg, #0a0a0a 0%, #141414 100%)',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-in-out',
        'slide-up': 'slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        'pulse-gold': 'pulseGold 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        pulseGold: {
          '0%, 100%': { boxShadow: '0 0 10px rgba(201, 168, 76, 0.3)' },
          '50%': { boxShadow: '0 0 25px rgba(201, 168, 76, 0.6)' },
        },
      },
    },
  },
  plugins: [],
}

export default config
