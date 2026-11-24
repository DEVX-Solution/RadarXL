import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const resourcesDir = path.join(rootDir, 'resources');

if (!fs.existsSync(resourcesDir)) {
  fs.mkdirSync(resourcesDir, { recursive: true });
}

console.log('[RadarXL Packager] 1. Gerando bundle do backend via esbuild...');
const bundleOut = path.join(resourcesDir, 'bundle.mjs');
const entryPoint = path.join(rootDir, 'src', 'index.js');

const esbuildCmd = `npx.cmd esbuild "${entryPoint}" --bundle --platform=node --format=esm --outfile="${bundleOut}" --banner:js="import { createRequire } from 'module'; const require = createRequire(import.meta.url);" --external:node:sqlite --external:typescript --external:lighthouse`;

execSync(esbuildCmd, { cwd: rootDir, stdio: 'inherit' });

console.log('[RadarXL Packager] 2. Incorporando binário portátil do Node.js...');
const nodeTarget = path.join(resourcesDir, 'node.exe');

// Tentar copiar o executável do Node atual
if (fs.existsSync(process.execPath)) {
  fs.copyFileSync(process.execPath, nodeTarget);
  console.log(`[RadarXL Packager] node.exe copiado com sucesso de ${process.execPath} para ${nodeTarget}`);
} else {
  const commonPaths = [
    'C:\\Program Files\\nodejs\\node.exe',
    'C:\\Program Files (x86)\\nodejs\\node.exe'
  ];
  const found = commonPaths.find((p) => fs.existsSync(p));
  if (found) {
    fs.copyFileSync(found, nodeTarget);
    console.log(`[RadarXL Packager] node.exe copiado de ${found}`);
  } else {
    console.warn('[RadarXL Packager] AVISO: node.exe não encontrado para cópia.');
  }
}

console.log('[RadarXL Packager] Preparação de recursos concluída com sucesso!');
