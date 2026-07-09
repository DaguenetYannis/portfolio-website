import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

export default defineConfig({
  // Enable strict mode for type safety
  strict: true,
  integrations: [react()],
  
  // Configure build output
  outDir: './dist',
  publicDir: './public',
  
  // Vite configuration
  vite: {
    ssr: {
      external: []
    }
  }
});
