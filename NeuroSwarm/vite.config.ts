import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import { builtinModules } from 'module';

// https://vitejs.dev/config/
export default defineConfig({
  assetsInclude: ['**/*.json'],
  build: {
    commonjsOptions: {
      transformMixedEsModules: true,
      include: [/node_modules/],
      exclude: [/node_modules\/elliptic\/lib\/elliptic\.js/],
    },
    target: 'es2020',
    rollupOptions: {
      external: [
        ...builtinModules,
        'electron',
        '@trezor/connect-common',
        '@trezor/utils',
        'elliptic',
        '@toruslabs/metadata-helpers',
      ],
      output: {
        manualChunks: {
          'solana-web3': ['@solana/web3.js'],
          'solana-spl': ['@solana/spl-token'],
          'bn': ['bn.js']
        }
      }
    }
  },
  plugins: [
    nodePolyfills({
      include: ['buffer', 'crypto', 'stream', 'util', 'http', 'https', 'zlib', 'os', 'url', 'assert'],
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
    }),
    react(),
    nodePolyfills({
      // Polyfills for Solana web3.js
      include: ['buffer', 'crypto', 'stream', 'util', 'http', 'https', 'url', 'os', 'path', 'zlib']
    })
  ],
  optimizeDeps: {
    exclude: ['lucide-react', 'elliptic'],
    include: [
      '@solana/web3.js',
      '@solana/spl-token',
      'bn.js',
      '@toruslabs/metadata-helpers'
    ],
    esbuildOptions: {
      target: 'es2020'
    }
  },
  resolve: {
    alias: {
      // Polyfill node modules
      buffer: 'rollup-plugin-node-polyfills/polyfills/buffer-es6',
      http: 'rollup-plugin-node-polyfills/polyfills/http',
      https: 'rollup-plugin-node-polyfills/polyfills/http',
      url: 'rollup-plugin-node-polyfills/polyfills/url',
      os: 'rollup-plugin-node-polyfills/polyfills/os',
      path: 'rollup-plugin-node-polyfills/polyfills/path',
      zlib: 'rollup-plugin-node-polyfills/polyfills/zlib',
      // Fix for elliptic library
      'elliptic': './node_modules/elliptic/lib/elliptic.js'
    }
  },
  define: {
    'process.env': {},
    global: 'globalThis',
  }
});
