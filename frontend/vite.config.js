import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // All /api/* calls go to Spring Boot
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      // Internal endpoints Flask needs
      '/internal': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      // CSV sync runs in the Python service because it generates embeddings.
      '/ai': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ai/, ''),
      },
    }
  }
})