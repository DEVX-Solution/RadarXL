-- ==============================================================================
-- RADARXL 2.0 - SUPABASE POSTGRESQL INITIAL SCHEMA & RLS POLICIES
-- ==============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. TEAMS
CREATE TABLE IF NOT EXISTS public.teams (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 3. PROFILES (Extende auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
    full_name TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
    avatar_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 4. TEAM MEMBERS
CREATE TABLE IF NOT EXISTS public.team_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    UNIQUE(team_id, user_id)
);

-- 5. INVITATIONS
CREATE TABLE IF NOT EXISTS public.invitations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
    token TEXT UNIQUE NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now() + interval '7 days')
);

-- 6. SEARCHES (Pesquisas da equipe)
CREATE TABLE IF NOT EXISTS public.searches (
    id TEXT PRIMARY KEY,
    team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    categoria TEXT NOT NULL,
    cidade TEXT NOT NULL,
    estado TEXT,
    limite INTEGER NOT NULL DEFAULT 10,
    status TEXT NOT NULL DEFAULT 'executando' CHECK (status IN ('pendente', 'executando', 'concluido', 'parcial', 'falhou', 'cancelado')),
    progress_percent INTEGER NOT NULL DEFAULT 0,
    completed_count INTEGER NOT NULL DEFAULT 0,
    desired_count INTEGER NOT NULL DEFAULT 0,
    scanned_count INTEGER NOT NULL DEFAULT 0,
    discarded_count INTEGER NOT NULL DEFAULT 0,
    repeated_count INTEGER NOT NULL DEFAULT 0,
    error_message TEXT,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_by_name TEXT NOT NULL DEFAULT 'Operador',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 7. LEADS (Empresas encontradas - Deduplicação por equipe)
CREATE TABLE IF NOT EXISTS public.leads (
    id TEXT PRIMARY KEY,
    team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    empresa TEXT NOT NULL,
    categoria TEXT,
    cidade TEXT,
    estado TEXT,
    site TEXT,
    site_domain TEXT,
    instagram TEXT,
    instagram_url TEXT,
    email TEXT,
    telefone TEXT,
    telefone_normalizado TEXT,
    status TEXT NOT NULL DEFAULT 'descoberto',
    score INTEGER NOT NULL DEFAULT 0,
    favorite BOOLEAN NOT NULL DEFAULT FALSE,
    fonte TEXT,
    google_place_id TEXT,
    osm_id TEXT,
    maps_url TEXT,
    screenshot_url TEXT,
    auditoria JSONB DEFAULT '{}'::jsonb,
    website_data JSONB DEFAULT '{}'::jsonb,
    instagram_details JSONB DEFAULT '{}'::jsonb,
    problemas JSONB DEFAULT '[]'::jsonb,
    analise_ia TEXT,
    mensagem_personalizada TEXT,
    canal_recomendado TEXT,
    ai_provider TEXT,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 8. SEARCH LEADS (Relação N:N entre Pesquisas e Leads)
CREATE TABLE IF NOT EXISTS public.search_leads (
    search_id TEXT NOT NULL REFERENCES public.searches(id) ON DELETE CASCADE,
    lead_id TEXT NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
    team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    PRIMARY KEY (search_id, lead_id)
);

-- 9. LEAD ACTIVITIES (Histórico de alterações e contatos comerciais)
CREATE TABLE IF NOT EXISTS public.lead_activities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lead_id TEXT NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
    team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    user_name TEXT NOT NULL DEFAULT '',
    activity_type TEXT NOT NULL,
    details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 10. AUDIT RESULTS (Resultados detalhados de auditorias)
CREATE TABLE IF NOT EXISTS public.audit_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lead_id TEXT NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
    team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    performance INTEGER,
    seo INTEGER,
    acessibilidade INTEGER,
    ssl BOOLEAN DEFAULT FALSE,
    mobile_friendly BOOLEAN DEFAULT FALSE,
    load_time_ms INTEGER DEFAULT 0,
    http_status INTEGER DEFAULT 0,
    broken_layout BOOLEAN DEFAULT FALSE,
    audit_mode TEXT DEFAULT 'economico',
    audit_source TEXT DEFAULT 'technical_fallback',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 11. APP SETTINGS (Configurações compartilhadas da equipe)
CREATE TABLE IF NOT EXISTS public.app_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    value JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    UNIQUE(team_id, key)
);

-- ==============================================================================
-- ÍNDICES DE PERFORMANCE E DEDUPLICAÇÃO
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_leads_team_score ON public.leads(team_id, score DESC);
CREATE INDEX IF NOT EXISTS idx_leads_team_fav ON public.leads(team_id, favorite);
CREATE INDEX IF NOT EXISTS idx_leads_team_domain ON public.leads(team_id, site_domain);
CREATE INDEX IF NOT EXISTS idx_leads_team_phone ON public.leads(team_id, telefone_normalizado);
CREATE INDEX IF NOT EXISTS idx_leads_team_place_id ON public.leads(team_id, google_place_id);
CREATE INDEX IF NOT EXISTS idx_leads_team_osm_id ON public.leads(team_id, osm_id);
CREATE INDEX IF NOT EXISTS idx_searches_team_created ON public.searches(team_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_team_members_user ON public.team_members(user_id);

-- ==============================================================================
-- FUNÇÃO AUXILIAR: PEGAR TEAM_ID DO USUÁRIO LOGADO
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.get_current_team_id()
RETURNS UUID AS $$
  SELECT team_id FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) - ISOLAMENTO TOTAL ENTRE EQUIPES
-- ==============================================================================
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.searches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.search_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Regras de Profiles
CREATE POLICY "profiles_select_own_or_team" ON public.profiles
    FOR SELECT TO authenticated
    USING (id = auth.uid() OR team_id = public.get_current_team_id());

CREATE POLICY "profiles_update_own" ON public.profiles
    FOR UPDATE TO authenticated
    USING (id = auth.uid());

-- Regras de Teams
CREATE POLICY "teams_select_member" ON public.teams
    FOR SELECT TO authenticated
    USING (id = public.get_current_team_id());

-- Regras de Searches
CREATE POLICY "searches_team_all" ON public.searches
    FOR ALL TO authenticated
    USING (team_id = public.get_current_team_id())
    WITH CHECK (team_id = public.get_current_team_id());

-- Regras de Leads
CREATE POLICY "leads_team_all" ON public.leads
    FOR ALL TO authenticated
    USING (team_id = public.get_current_team_id())
    WITH CHECK (team_id = public.get_current_team_id());

-- Regras de Search Leads
CREATE POLICY "search_leads_team_all" ON public.search_leads
    FOR ALL TO authenticated
    USING (team_id = public.get_current_team_id())
    WITH CHECK (team_id = public.get_current_team_id());

-- Regras de Lead Activities
CREATE POLICY "activities_team_all" ON public.lead_activities
    FOR ALL TO authenticated
    USING (team_id = public.get_current_team_id())
    WITH CHECK (team_id = public.get_current_team_id());

-- Regras de Audit Results
CREATE POLICY "audits_team_all" ON public.audit_results
    FOR ALL TO authenticated
    USING (team_id = public.get_current_team_id())
    WITH CHECK (team_id = public.get_current_team_id());

-- Regras de App Settings
CREATE POLICY "settings_team_all" ON public.app_settings
    FOR ALL TO authenticated
    USING (team_id = public.get_current_team_id())
    WITH CHECK (team_id = public.get_current_team_id());

-- ==============================================================================
-- DEDUPLICAÇÃO ATÔMICA E IDEMPOTENTE NO POSTGRESQL
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.upsert_team_lead(
    p_lead JSONB,
    p_search_id TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_team_id UUID;
    v_lead_id TEXT;
    v_existing_id TEXT;
    v_now TIMESTAMPTZ := timezone('utc'::text, now());
    v_result JSONB;
BEGIN
    v_team_id := public.get_current_team_id();
    IF v_team_id IS NULL THEN
        RAISE EXCEPTION 'Usuário não associado a uma equipe autorizada.';
    END IF;

    v_lead_id := p_lead->>'id';

    -- 1. Deduplicação por Google Place ID
    IF p_lead->>'google_place_id' IS NOT NULL AND (p_lead->>'google_place_id') <> '' THEN
        SELECT id INTO v_existing_id FROM public.leads
        WHERE team_id = v_team_id AND google_place_id = (p_lead->>'google_place_id') LIMIT 1;
    END IF;

    -- 2. Deduplicação por OSM ID
    IF v_existing_id IS NULL AND p_lead->>'osm_id' IS NOT NULL AND (p_lead->>'osm_id') <> '' THEN
        SELECT id INTO v_existing_id FROM public.leads
        WHERE team_id = v_team_id AND osm_id = (p_lead->>'osm_id') LIMIT 1;
    END IF;

    -- 3. Deduplicação por Domínio do Site
    IF v_existing_id IS NULL AND p_lead->>'site_domain' IS NOT NULL AND (p_lead->>'site_domain') <> '' THEN
        SELECT id INTO v_existing_id FROM public.leads
        WHERE team_id = v_team_id AND site_domain = (p_lead->>'site_domain') LIMIT 1;
    END IF;

    -- 4. Deduplicação por Telefone Normalizado
    IF v_existing_id IS NULL AND p_lead->>'telefone_normalizado' IS NOT NULL AND (p_lead->>'telefone_normalizado') <> '' THEN
        SELECT id INTO v_existing_id FROM public.leads
        WHERE team_id = v_team_id AND telefone_normalizado = (p_lead->>'telefone_normalizado') LIMIT 1;
    END IF;

    -- 5. Fallback por Nome + Cidade
    IF v_existing_id IS NULL AND p_lead->>'empresa' IS NOT NULL AND p_lead->>'cidade' IS NOT NULL THEN
        SELECT id INTO v_existing_id FROM public.leads
        WHERE team_id = v_team_id 
          AND LOWER(empresa) = LOWER(p_lead->>'empresa')
          AND LOWER(cidade) = LOWER(p_lead->>'cidade') LIMIT 1;
    END IF;

    IF v_existing_id IS NOT NULL THEN
        v_lead_id := v_existing_id;
    END IF;

    -- Inserção ou atualização idempotente preservando informações ricas
    INSERT INTO public.leads (
        id, team_id, empresa, categoria, cidade, estado, site, site_domain,
        instagram, instagram_url, email, telefone, telefone_normalizado,
        status, score, favorite, fonte, google_place_id, osm_id, maps_url,
        screenshot_url, auditoria, website_data, instagram_details, problemas,
        analise_ia, mensagem_personalizada, canal_recomendado, ai_provider,
        created_by, created_at, updated_at
    ) VALUES (
        v_lead_id,
        v_team_id,
        COALESCE(p_lead->>'empresa', 'Empresa'),
        COALESCE(p_lead->>'categoria', ''),
        COALESCE(p_lead->>'cidade', ''),
        COALESCE(p_lead->>'estado', ''),
        COALESCE(p_lead->>'site', ''),
        COALESCE(p_lead->>'site_domain', ''),
        COALESCE(p_lead->>'instagram', ''),
        COALESCE(p_lead->>'instagram_url', ''),
        COALESCE(p_lead->>'email', ''),
        COALESCE(p_lead->>'telefone', ''),
        COALESCE(p_lead->>'telefone_normalizado', ''),
        COALESCE(p_lead->>'status', 'descoberto'),
        COALESCE((p_lead->>'score')::INTEGER, 0),
        COALESCE((p_lead->>'favorite')::BOOLEAN, FALSE),
        COALESCE(p_lead->>'fonte', 'RadarXL'),
        NULLIF(p_lead->>'google_place_id', ''),
        NULLIF(p_lead->>'osm_id', ''),
        COALESCE(p_lead->>'maps_url', ''),
        COALESCE(p_lead->>'screenshot_url', ''),
        COALESCE(p_lead->'auditoria', '{}'::jsonb),
        COALESCE(p_lead->'website_data', '{}'::jsonb),
        COALESCE(p_lead->'instagram_details', '{}'::jsonb),
        COALESCE(p_lead->'problemas', '[]'::jsonb),
        COALESCE(p_lead->>'analise_ia', ''),
        COALESCE(p_lead->>'mensagem_personalizada', ''),
        COALESCE(p_lead->>'canal_recomendado', ''),
        COALESCE(p_lead->>'ai_provider', ''),
        auth.uid(),
        v_now,
        v_now
    )
    ON CONFLICT (id) DO UPDATE SET
        empresa = EXCLUDED.empresa,
        categoria = CASE WHEN EXCLUDED.categoria <> '' THEN EXCLUDED.categoria ELSE public.leads.categoria END,
        cidade = CASE WHEN EXCLUDED.cidade <> '' THEN EXCLUDED.cidade ELSE public.leads.cidade END,
        estado = CASE WHEN EXCLUDED.estado <> '' THEN EXCLUDED.estado ELSE public.leads.estado END,
        site = CASE WHEN EXCLUDED.site <> '' THEN EXCLUDED.site ELSE public.leads.site END,
        site_domain = CASE WHEN EXCLUDED.site_domain <> '' THEN EXCLUDED.site_domain ELSE public.leads.site_domain END,
        instagram = CASE WHEN EXCLUDED.instagram <> '' THEN EXCLUDED.instagram ELSE public.leads.instagram END,
        instagram_url = CASE WHEN EXCLUDED.instagram_url <> '' THEN EXCLUDED.instagram_url ELSE public.leads.instagram_url END,
        email = CASE WHEN EXCLUDED.email <> '' THEN EXCLUDED.email ELSE public.leads.email END,
        telefone = CASE WHEN EXCLUDED.telefone <> '' THEN EXCLUDED.telefone ELSE public.leads.telefone END,
        telefone_normalizado = CASE WHEN EXCLUDED.telefone_normalizado <> '' THEN EXCLUDED.telefone_normalizado ELSE public.leads.telefone_normalizado END,
        status = CASE WHEN EXCLUDED.status = 'concluido' THEN 'concluido' ELSE public.leads.status END,
        score = GREATEST(EXCLUDED.score, public.leads.score),
        favorite = public.leads.favorite OR EXCLUDED.favorite,
        auditoria = CASE WHEN jsonb_typeof(EXCLUDED.auditoria) = 'object' AND EXCLUDED.auditoria <> '{}'::jsonb THEN EXCLUDED.auditoria ELSE public.leads.auditoria END,
        website_data = CASE WHEN jsonb_typeof(EXCLUDED.website_data) = 'object' AND EXCLUDED.website_data <> '{}'::jsonb THEN EXCLUDED.website_data ELSE public.leads.website_data END,
        instagram_details = CASE WHEN jsonb_typeof(EXCLUDED.instagram_details) = 'object' AND EXCLUDED.instagram_details <> '{}'::jsonb THEN EXCLUDED.instagram_details ELSE public.leads.instagram_details END,
        analise_ia = CASE WHEN EXCLUDED.analise_ia <> '' THEN EXCLUDED.analise_ia ELSE public.leads.analise_ia END,
        mensagem_personalizada = CASE WHEN EXCLUDED.mensagem_personalizada <> '' THEN EXCLUDED.mensagem_personalizada ELSE public.leads.mensagem_personalizada END,
        updated_at = v_now;

    -- Vincular à pesquisa através de search_leads se fornecido search_id
    IF p_search_id IS NOT NULL AND p_search_id <> '' THEN
        INSERT INTO public.search_leads (search_id, lead_id, team_id, created_at)
        VALUES (p_search_id, v_lead_id, v_team_id, v_now)
        ON CONFLICT (search_id, lead_id) DO NOTHING;
    END IF;

    SELECT row_to_json(l)::jsonb INTO v_result FROM public.leads l WHERE l.id = v_lead_id;
    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==============================================================================
-- REALTIME PUBLICATION SETUP
-- ==============================================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'searches'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.searches;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'leads'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;
    END IF;
END $$;
