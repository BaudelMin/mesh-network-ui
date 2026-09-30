import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // Relative asset paths so the build works from the driver's web tab folder in Composer.
  base: './',
  plugins: [react()],
})
