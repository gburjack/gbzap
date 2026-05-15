import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Para GitHub Pages: ajuste 'gbzap' para o nome do seu repositório
  base: '/gbzap/',
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/webhook': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})
