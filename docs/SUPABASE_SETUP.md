# Guia de Configuração do Supabase (Plano Gratuito)

O RadarXL 2.0 foi planejado para operar 100% dentro do **Free Tier do Supabase** (500 MB de banco, 50.000 usuários ativos mensais e 200 conexões Realtime simultâneas), pois todo o scraping e processamento pesado é executado localmente nos computadores da equipe.

---

## 1. Passo a Passo de Criação do Projeto

1. Acesse [supabase.com](https://supabase.com) e crie uma conta gratuita.
2. Clique em **"New Project"**.
3. Defina:
   - **Name**: `RadarXL-Intelligence`
   - **Database Password**: Escolha uma senha segura.
   - **Region**: `South America (São Paulo)` para menor latência no Brasil.
4. Aguarde a criação do banco de dados (leva cerca de 2 minutos).

---

## 2. Executar as Migrations do Banco

1. No menu lateral do dashboard do Supabase, clique em **SQL Editor**.
2. Clique em **"New query"**.
3. Abra o arquivo do projeto:
   `infra/database/migrations/001_initial_schema.sql`
4. Copie todo o conteúdo do arquivo, cole no editor SQL do Supabase e clique em **"Run"**.
5. Todas as 10 tabelas, índices, triggers, políticas de Row Level Security (RLS) e a função RPC de deduplicação serão criadas com sucesso.

---

## 3. Criar a Primeira Equipe e o Administrador

No SQL Editor, execute o script abaixo (substituindo pelo seu e-mail de administrador):

```sql
-- 1. Criar a Equipe Comercial
INSERT INTO public.teams (id, name, slug)
VALUES ('00000000-0000-0000-0000-000000000001', 'Minha Agência', 'minha-agencia')
ON CONFLICT DO NOTHING;

-- 2. Após se cadastrar via Auth ou Authentication > Users, vincule seu ID:
-- UPDATE public.profiles 
-- SET team_id = '00000000-0000-0000-0000-000000000001', role = 'admin' 
-- WHERE email = 'admin@suaagencia.com.br';
```

---

## 4. Obter as Chaves de Acesso e Configurar no RadarXL

1. No Supabase, clique em **Project Settings** (ícone de engrenagem) > **API**.
2. Localize:
   - **Project URL**: `https://xxxxxxxxxxxx.supabase.co`
   - **anon / public key**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`
3. **ATENÇÃO DE SEGURANÇA**: **NUNCA UTILIZE A CHAVE `service_role`**. O RadarXL utiliza estritamente a chave pública `anon`, protegida pelo sistema de RLS no PostgreSQL.
4. No arquivo `.env` do RadarXL em cada computador, configure:
   ```env
   SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
   SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   ```

Pronto! Os operadores poderão fazer login pelo menu da barra superior do RadarXL e todas as pesquisas serão sincronizadas em tempo real.
