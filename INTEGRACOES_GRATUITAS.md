# Integrações gratuitas

O projeto funciona sem cartão, assinatura ou chave paga. As integrações abaixo são usadas com limites conservadores e podem ser substituídas por configuração.

## OpenStreetMap

Uso no projeto:

- **Nominatim**: converte a cidade informada em coordenadas e limites geográficos.
- **Overpass API**: busca estabelecimentos por categoria dentro da cidade.
- Dados aproveitados quando disponíveis: nome, endereço, website, telefone, email, WhatsApp e Instagram.

Arquivos principais:

- `src/scraper/openstreetmap.js`
- `src/config.js`
- `data/geocode-cache.json`

Proteções implementadas:

- máximo de uma consulta ao Nominatim por segundo;
- cache persistente das cidades;
- busca acionada diretamente pelo usuário, sem varredura automática;
- limites pequenos de resultados;
- identificação por `User-Agent`;
- dois servidores Overpass configuráveis para tolerância a falhas;
- atribuição visível no dashboard e registrada em cada lead.

Licença: os dados do OpenStreetMap são disponibilizados sob ODbL 1.0. Ao redistribuir ou criar uma base derivada, preserve a atribuição e observe o compartilhamento pela mesma licença.

Referências oficiais:

- Política do Nominatim: https://operations.osmfoundation.org/policies/nominatim/
- Overpass API: https://wiki.openstreetmap.org/wiki/Overpass_API
- Direitos autorais e ODbL: https://www.openstreetmap.org/copyright

## Instagram

Não existe uma API pública gratuita adequada para pesquisar livremente perfis de empresas. Para evitar serviços pagos e coleta agressiva, o projeto usa:

1. perfil informado no cadastro do OpenStreetMap;
2. link encontrado no site oficial da empresa;
3. Google Custom Search somente quando o usuário configurar voluntariamente as chaves opcionais.

O Instagram pode limitar a leitura pública. Nessas situações o sistema registra que os dados estão indisponíveis, sem inventar seguidores ou atividade.

## IA local com Ollama

O Ollama executa modelos no próprio computador e não exige chave de API. O projeto tenta usar `qwen2.5:3b`, um modelo relativamente leve. Se não estiver disponível, o gerador interno continua produzindo análises e mensagens sem IA externa.

Instalação opcional:

1. Instale o Ollama em https://ollama.com/download
2. Baixe o modelo:

```bash
ollama pull qwen2.5:3b
```

3. Mantenha o Ollama aberto e execute normalmente:

```bash
npm start
```

API oficial utilizada: https://docs.ollama.com/api/chat

## Auditoria gratuita

Lighthouse e Puppeteer são executados localmente com o Chromium instalado pelo projeto. Performance, SEO, acessibilidade, responsividade e screenshots não dependem de APIs pagas.

## Uso responsável

- Trabalhe apenas com contatos profissionais publicados pelas próprias empresas ou em base aberta.
- Não automatize disparos em massa.
- Revise mensagens antes do envio.
- Respeite pedidos de remoção e oposição.
- Para operação comercial em grande escala, hospede sua própria instância do Nominatim/Overpass ou contrate infraestrutura apropriada.
