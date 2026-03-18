import { build } from 'esbuild'

await build({
  entryPoints: [
    'extension/background.js',
    'extension/content.js',
    'extension/webpage-content.js',
    'extension/sidepanel.js',
    'extension/options.js',
  ],
  bundle: true,
  outdir: 'extension/dist',
  format: 'iife',
  target: 'chrome120',
})

console.log('Build complete')
