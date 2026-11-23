import fs from 'node:fs';
import path from 'node:path';

const iconsDir = path.join(process.cwd(), 'src-tauri', 'icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

// 1x1 pixel PNG transparente como fallback mínimo estrutural
// Vamos gerar buffers PNG válidos para os arquivos exigidos pelo Tauri
function createMinimalPng(width, height) {
  // SVG da Logo RadarXL com ciano e escuro tecnológico
  const svg = `
  <svg width="${width}" height="${height}" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <rect width="100" height="100" rx="20" fill="#0b111a"/>
    <circle cx="50" cy="50" r="38" fill="none" stroke="#00f2fe" stroke-width="2.5" opacity="0.3"/>
    <circle cx="50" cy="50" r="26" fill="none" stroke="#00f2fe" stroke-width="2.5" opacity="0.6"/>
    <circle cx="50" cy="50" r="14" fill="none" stroke="#00f2fe" stroke-width="3"/>
    <line x1="50" y1="12" x2="50" y2="88" stroke="#00f2fe" stroke-width="1.5" opacity="0.4"/>
    <line x1="12" y1="50" x2="88" y2="50" stroke="#00f2fe" stroke-width="1.5" opacity="0.4"/>
    <path d="M50 50 L75 25 A 35 35 0 0 0 50 15 Z" fill="url(#sweep)" opacity="0.5"/>
    <circle cx="65" cy="35" r="3.5" fill="#00f2fe"/>
    <defs>
      <linearGradient id="sweep" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#00f2fe" stop-opacity="0.8"/>
        <stop offset="100%" stop-color="#4facfe" stop-opacity="0.0"/>
      </linearGradient>
    </defs>
  </svg>
  `;
  return svg;
}

// Salva arquivos SVG e placeholders
fs.writeFileSync(path.join(iconsDir, 'icon.svg'), createMinimalPng(512, 512));

// Um buffer PNG 1x1 mínimo e válido para inicialização
const validPngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const pngBuffer = Buffer.from(validPngBase64, 'base64');

fs.writeFileSync(path.join(iconsDir, '32x32.png'), pngBuffer);
fs.writeFileSync(path.join(iconsDir, '128x128.png'), pngBuffer);
fs.writeFileSync(path.join(iconsDir, '128x128@2x.png'), pngBuffer);
fs.writeFileSync(path.join(iconsDir, 'icon.ico'), pngBuffer);

console.log('Ícones criados em src-tauri/icons com sucesso!');
