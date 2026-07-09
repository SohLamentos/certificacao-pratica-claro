import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  let enableRealtime = 'false';
  try {
    const wranglerPath = path.resolve(__dirname, 'wrangler.toml');
    if (fs.existsSync(wranglerPath)) {
      const content = fs.readFileSync(wranglerPath, 'utf8');
      const match = content.match(/ENABLE_REALTIME\s*=\s*["']?(true|false)["']?/i);
      if (match) {
        enableRealtime = match[1].toLowerCase();
      }
    }
  } catch (err) {
    console.error('Error reading wrangler.toml in vite.config.ts:', err);
  }

  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.ENABLE_REALTIME': JSON.stringify(enableRealtime),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
