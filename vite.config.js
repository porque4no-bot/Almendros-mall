import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/Almendros-mall/',
  server: {
    port: 5173,
    open: true
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          // React core — cambia muy poco, caché muy larga
          'vendor-react': ['react', 'react-dom'],
          // Firebase — SDK grande, separado para no invalidar caché de app
          'vendor-firebase': ['firebase/app', 'firebase/firestore'],
          // Iconos — tree-shakeable pero aun así separado
          'vendor-icons': ['lucide-react'],
        },
      },
    },
  }
})
