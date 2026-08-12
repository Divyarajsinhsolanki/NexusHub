// vite.config.mts
import { defineConfig } from 'vite';
import RubyPlugin from 'vite-plugin-ruby';

const chunkGroups = {
  // Core vendor libraries
  'vendor-react': ['react', 'react-dom', 'react-router-dom'],
  'vendor-ui': ['react-hot-toast', 'react-helmet-async', '@headlessui/react', 'lucide-react', '@heroicons/react'],
  'vendor-animation': ['framer-motion'],
  'vendor-http': ['axios'],

  // Data visualization (separate to lazy-load)
  'charts': ['recharts'],

  // Drag and drop (consolidated to single library)
  'dnd': ['@hello-pangea/dnd'],

  // PDF handling (will be lazy-loaded)
  'pdf': ['pdfjs-dist', 'react-pdf', '@react-pdf/renderer'],

  // Firebase modules used by firebaseConfig.js/AuthContext.jsx
  'firebase': ['firebase/app', 'firebase/auth'],

  // Utilities
  'utils': ['date-fns', 'jwt-decode', 'react-icons', 'react-draggable', 'react-dropzone', 'react-rnd']
};

const manualChunks = (id: string) => {
  if (!id.includes('/node_modules/')) return undefined;

  for (const [chunkName, packages] of Object.entries(chunkGroups)) {
    if (packages.some((packageName) => id.includes(`/node_modules/${packageName}/`))) {
      return chunkName;
    }
  }

  return undefined;
};

const isProductionBuild = process.env.RAILS_ENV === 'production' || process.env.NODE_ENV === 'production';

export default defineConfig({
  plugins: [RubyPlugin()],
  resolve: {
    dedupe: ['react', 'react-dom']
  },
  
  build: {
    minify: 'esbuild',
    sourcemap: false, // Disable in production for faster builds and smaller artifacts
    chunkSizeWarningLimit: 1200,
    reportCompressedSize: false,
    
    rollupOptions: {
      // input: {
      //   application: 'app/javascript/entrypoints/application.jsx'
      // },
      output: {
        manualChunks
      }
    }
  },
  
  // Optimize dependency pre-bundling
  optimizeDeps: {
    include: [
      'react',
      'react/jsx-runtime',
      'react/jsx-dev-runtime',
      'react-dom',
      'react-dom/client',
      'react-router-dom',
      'axios',
      'framer-motion',
      '@hello-pangea/dnd',
      'date-fns',
      'lucide-react',
      'react-pdf',
      'warning'
    ],
    exclude: [
      'three', // Will be lazy-loaded
      'pdfjs-dist', // Will be lazy-loaded
      'firebase' // Consider lazy-loading in future
    ]
  },
  
  server: {
    hmr: isProductionBuild ? false : { clientPort: 3036 },
    // This workspace can exceed Linux inotify limits when Rails, esbuild,
    // and Vite all watch files at once. Polling keeps Vite stable in dev.
    watch: {
      usePolling: true,
      interval: 1000,
      ignored: [
        '**/.git/**',
        '**/node_modules/**',
        '**/public/vite/**',
        '**/public/vite-dev/**',
        '**/public/uploads/**',
        '**/public/documents/**',
        '**/public/temp_uploads/**',
        '**/storage/**',
        '**/tmp/**',
        '**/log/**',
        '**/vendor/**'
      ]
    }
  }
});
