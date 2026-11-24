import fs from 'node:fs';
import path from 'node:path';

const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
if (!TOKEN) {
  console.error('GITHUB_TOKEN nao configurado no ambiente.');
  process.exit(1);
}
const REPO = 'DEVX-Solution/RadarXL';
const TAG = 'v2.0.3';
const NAME = 'RadarXL Intelligence v2.0.3';
const BODY = 'Atualizacao automatica 2.0.3 com correcao de inicializacao, abertura de links no navegador e motor local integrado.';

async function main() {
  console.log('1. Criando release no GitHub:', TAG);
  const createRes = await fetch(`https://api.github.com/repos/${REPO}/releases`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'User-Agent': 'Node-Release-Uploader',
      'Content-Type': 'application/json',
      Accept: 'application/vnd.github.v3+json'
    },
    body: JSON.stringify({
      tag_name: TAG,
      target_commitish: 'main',
      name: NAME,
      body: BODY,
      draft: false,
      prerelease: false,
      make_latest: 'true'
    })
  });

  const release = await createRes.json();
  if (!release.id) {
    console.error('Erro ao criar release:', release);
    process.exit(1);
  }
  console.log('Release criada com ID:', release.id, 'Upload URL:', release.upload_url);

  const uploadBaseUrl = release.upload_url.replace('{?name,label}', '');

  const assetsToUpload = [
    {
      name: 'RadarXL_2.0.3_x64-setup.exe',
      path: path.resolve('release', 'RadarXL-Setup.exe'),
      contentType: 'application/vnd.microsoft.portable-executable'
    },
    {
      name: 'RadarXL_2.0.3_x64-setup.exe.sig',
      path: path.resolve('release', 'RadarXL-Setup.exe.sig'),
      contentType: 'text/plain'
    },
    {
      name: 'latest.json',
      path: path.resolve('updates', 'latest.json'),
      contentType: 'application/json'
    }
  ];

  for (const asset of assetsToUpload) {
    console.log(`Fazendo upload do asset: ${asset.name} (${fs.statSync(asset.path).size} bytes)...`);
    const fileBuffer = fs.readFileSync(asset.path);
    const upRes = await fetch(`${uploadBaseUrl}?name=${asset.name}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'User-Agent': 'Node-Release-Uploader',
        'Content-Type': asset.contentType,
        'Content-Length': fileBuffer.length.toString()
      },
      body: fileBuffer
    });

    const upJson = await upRes.json();
    if (upJson.id) {
      console.log(`Asset ${asset.name} enviado com sucesso! ID:`, upJson.id);
    } else {
      console.error(`Erro ao enviar asset ${asset.name}:`, upJson);
    }
  }

  console.log('Todos os assets foram enviados para a release v2.0.3!');
}

main().catch(console.error);
