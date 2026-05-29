import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      boxShadow: {
        soft: '0 20px 60px -24px rgba(0, 0, 0, 0.65)',
      },
      backgroundImage: {
        'radial-soft': 'radial-gradient(circle at top, rgba(56, 189, 248, 0.18), transparent 34%), radial-gradient(circle at right, rgba(34, 197, 94, 0.12), transparent 28%), radial-gradient(circle at left, rgba(245, 158, 11, 0.11), transparent 24%)',
      },
    },
  },
  plugins: [],
};

export default config;