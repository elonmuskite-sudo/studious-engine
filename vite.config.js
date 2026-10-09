import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

import { cloudflare } from "@cloudflare/vite-plugin";

const hasBase44Proxy = Boolean(process.env.VITE_BASE44_APP_BASE_URL);

let base44Plugin = null;
if (hasBase44Proxy) {
  base44Plugin = (await import("@base44/vite-plugin")).default;
}

export default defineConfig({
  plugins: [
    react(),
    ...(base44Plugin ? [base44Plugin()] : []),
    cloudflare(),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react-dom') || id.includes('react-router')) return 'vendor'
            if (id.includes('/react/') && !id.includes('react-dom') && !id.includes('react-router')) return 'vendor'
            if (id.includes('@tanstack')) return 'query'
            if (id.includes('appwrite')) return 'appwrite'
            if (id.includes('framer-motion') || id.includes('next-themes')) return 'ui'
            if (id.includes('@heroicons') || id.includes('lucide-react')) return 'icons'
            if (id.includes('react-hook-form') || id.includes('@hookform') || id.includes('zod') || id.includes('input-otp')) return 'forms'
            if (id.includes('date-fns') || id.includes('class-variance-authority') || id.includes('clsx') || id.includes('tailwind-merge') || id.includes('react-markdown')) return 'util'
            if (id.includes('@base44')) return 'base44'
            if (id.includes('@radix-ui')) return 'radix'
          }
        },
      },
    },
  },
  server: {
    port: 5173,
  },
});
