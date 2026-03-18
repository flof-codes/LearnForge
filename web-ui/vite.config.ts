import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  envPrefix: ['VITE_', 'OPERATOR_'],
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          codemirror: ['codemirror', '@codemirror/lang-html', '@codemirror/theme-one-dark', '@codemirror/state', '@codemirror/view'],
          vendor: ['react', 'react-dom', 'react-router-dom', '@tanstack/react-query', 'axios', 'i18next', 'react-i18next'],
        },
      },
    },
  },
})
