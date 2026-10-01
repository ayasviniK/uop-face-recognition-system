import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/ai': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
      '/api/students/batch': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
      '/api/students/check-duplicates': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
      '/api/recognize': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
      '/api/students': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/students/, '/students'),
      },
      // All other /api/* calls go to Spring Boot
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      // Internal endpoints Flask needs
      '/internal': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    }
  }
})