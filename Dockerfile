# Dockerfile
FROM node:20-slim

# Instala o Google Chrome estável e as fontes necessárias para o Puppeteer rodar no Linux
RUN apt-get update \
    && apt-get install -y wget gnupg \
    && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /usr/share/keyrings/googlechrome-linux-keyring.gpg \
    && sh -c 'echo "deb [arch=amd64 signed-by=/usr/share/keyrings/googlechrome-linux-keyring.gpg] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' \
    && apt-get update \
    && apt-get install -y google-chrome-stable fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-khmeros fonts-kacst fonts-freefont-ttf libxss1 \
      --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Define o diretório de trabalho dentro do container
WORKDIR /app

# Copia os arquivos de dependência
COPY package*.json ./

# Instala as dependências de produção
RUN npm ci

# Copia o restante dos arquivos do código
COPY . .

# Garante que a pasta de dados e de capturas existam
RUN mkdir -p data/screenshots

# Define variáveis de ambiente necessárias para o Puppeteer rodar sem baixar o Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

# Porta padrão do Render
ENV PORT=10000
EXPOSE 10000

# Executa o servidor do Radar de Leads
CMD ["npm", "start"]
