const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');

console.log('====================================================');
console.log('🚀 Compilando LefTor GymAgent para macOS');
console.log('====================================================');

if (!fs.existsSync(distDir)) fs.mkdirSync(distDir, { recursive: true });

// Bundling con esbuild compatible con Node 12+
console.log('\n[*] Empaquetando código JavaScript con esbuild...');
const bundlePath = path.join(distDir, 'bundle.js');
try {
  execSync(`npx esbuild src/index.js --bundle --platform=node --target=node12 --outfile="${bundlePath}"`, {
    cwd: rootDir,
    stdio: 'inherit'
  });
  console.log('✅ Bundle creado con éxito en dist/bundle.js');
} catch (err) {
  console.error('❌ Error empaquetando con esbuild:', err.message);
  process.exit(1);
}

console.log('\n====================================================');
console.log('✅ PROCESO COMPLETADO EXITOSAMENTE');
console.log(`📂 Archivo listo: ${bundlePath}`);
console.log('====================================================\n');
