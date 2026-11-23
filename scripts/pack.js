import { execSync } from 'child_process';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

console.log('Iniciando empacotamento do projeto...');

try {
  if (os.platform() === 'win32') {
    execSync('powershell -ExecutionPolicy Bypass -File pack.ps1', {
      cwd: rootDir,
      stdio: 'inherit'
    });
  } else {
    execSync('bash pack.sh', {
      cwd: rootDir,
      stdio: 'inherit'
    });
  }
} catch (error) {
  console.error('Erro ao empacotamento:', error.message);
  process.exit(1);
}
