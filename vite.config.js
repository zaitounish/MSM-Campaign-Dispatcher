import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  build: {
    // Raise the warning threshold | internal tooling, not a public site
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        // Split large vendor libs into their own cached chunks
        manualChunks: {
          "vendor-recharts": ["recharts"],
          "vendor-lucide":   ["lucide-react"],
        },
      },
    },
  },
})
