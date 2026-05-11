import { defineConfig } from 'astro/config';

export default defineConfig({
  // Enable strict mode for type safety
  strict: true,
  
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
