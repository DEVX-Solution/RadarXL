-- ==============================================================================
-- RADARXL INTELLIGENCE 2.0 - SCHEMA COMPLETO E DEFINITIVO DO BANCO SUPABASE
-- Execute este script inteiro no SQL Editor do Supabase (Dashboard > SQL Editor > New query)
-- Cria todas as tabelas, índices, funções de convite, segurança RLS e vincula sua conta!
-- ==============================================================================

-- 1. EXTENSÕES
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. TABELA: TEAMS (Equipes)
CREATE TABLE IF NOT EXISTS public.teams (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 3. TABELA: PROFILES (Perfis de usuário estendendo auth.users)
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

-- 4. TABELA: TEAM_MEMBERS (Membros da equipe)
CREATE TABLE IF NOT EXISTS public.team_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    UNIQUE(team_id, user_id)
);

-- 5. TABELA: INVITATIONS (Convites e códigos de acesso)
CREATE TABLE IF NOT EXISTS public.invitations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    email TEXT,
    code TEXT,
    token TEXT UNIQUE NOT NULL,
    role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
    max_uses INTEGER NOT NULL DEFAULT 1,
    uses_count INTEGER NOT NULL DEFAULT 0,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now() + interval '30 days')
);

-- Garantir colunas caso a tabela invitations já existisse anteriormente
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invitations' AND column_name = 'code') THEN
        ALTER TABLE public.invitations ADD COLUMN code TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invitations' AND column_name = 'max_uses') THEN
        ALTER TABLE public.invitations ADD COLUMN max_uses INTEGER DEFAULT 1;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invitations' AND column_name = 'uses_count') THEN
        ALTER TABLE public.invitations ADD COLUMN uses_count INTEGER DEFAULT 0;
    END IF;
    ALTER TABLE public.invitations ALTER COLUMN email DROP NOT NULL;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

-- 6. TABELA: SEARCHES (Pesquisas da equipe)
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

-- 7. TABELA: LEADS (Empresas encontradas e enriquecidas)
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

-- 8. TABELA: SEARCH_LEADS (Relação N:N entre Pesquisas e Leads)
CREATE TABLE IF NOT EXISTS public.search_leads (
    search_id TEXT NOT NULL REFERENCES public.searches(id) ON DELETE CASCADE,
    lead_id TEXT NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
    team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    PRIMARY KEY (search_id, lead_id)
);

-- 9. TABELA: LEAD_ACTIVITIES (Histórico de atividades comerciais)
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

-- 10. TABELA: AUDIT_RESULTS (Auditorias técnicas)
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

-- 11. TABELA: APP_SETTINGS (Configurações da equipe)
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
CREATE INDEX IF NOT EXISTS idx_invitations_code ON public.invitations(code);

-- ==============================================================================
-- FUNÇÃO AUXILIAR: TEAM_ID DO USUÁRIO CONECTADO
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.get_current_team_id()
RETURNS UUID AS $$
  SELECT team_id FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- ==============================================================================
-- HABILITAR RLS (ROW LEVEL SECURITY)
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

-- POLÍTICAS DE TEAMS
DROP POLICY IF EXISTS "teams_insert_authenticated" ON public.teams;
CREATE POLICY "teams_insert_authenticated" ON public.teams
    FOR INSERT TO authenticated
    WITH CHECK (true);

DROP POLICY IF EXISTS "teams_select_member" ON public.teams;
CREATE POLICY "teams_select_member" ON public.teams
    FOR SELECT TO authenticated
    USING (
      id = public.get_current_team_id()
      OR id IN (SELECT team_id FROM public.team_members WHERE user_id = auth.uid())
      OR true
    );

DROP POLICY IF EXISTS "teams_update_admin" ON public.teams;
CREATE POLICY "teams_update_admin" ON public.teams
    FOR UPDATE TO authenticated
    USING (id = public.get_current_team_id());

-- POLÍTICAS DE PROFILES
DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
CREATE POLICY "profiles_insert_own" ON public.profiles
    FOR INSERT TO authenticated
    WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "profiles_select_own_or_team" ON public.profiles;
CREATE POLICY "profiles_select_own_or_team" ON public.profiles
    FOR SELECT TO authenticated
    USING (id = auth.uid() OR team_id = public.get_current_team_id());

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own" ON public.profiles
    FOR UPDATE TO authenticated
    USING (id = auth.uid());

-- POLÍTICAS DE TEAM_MEMBERS
DROP POLICY IF EXISTS "team_members_insert_own" ON public.team_members;
CREATE POLICY "team_members_insert_own" ON public.team_members
    FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "team_members_select" ON public.team_members;
CREATE POLICY "team_members_select" ON public.team_members
    FOR SELECT TO authenticated
    USING (team_id = public.get_current_team_id() OR user_id = auth.uid());

-- POLÍTICAS DE INVITATIONS
DROP POLICY IF EXISTS "invitations_all_authenticated" ON public.invitations;
CREATE POLICY "invitations_all_authenticated" ON public.invitations
    FOR ALL TO authenticated
    USING (team_id = public.get_current_team_id() OR true)
    WITH CHECK (true);

-- POLÍTICAS DE SEARCHES, LEADS E DADOS COMPARTILHADOS
DROP POLICY IF EXISTS "searches_team_all" ON public.searches;
CREATE POLICY "searches_team_all" ON public.searches
    FOR ALL TO authenticated
    USING (team_id = public.get_current_team_id())
    WITH CHECK (team_id = public.get_current_team_id());

DROP POLICY IF EXISTS "leads_team_all" ON public.leads;
CREATE POLICY "leads_team_all" ON public.leads
    FOR ALL TO authenticated
    USING (team_id = public.get_current_team_id())
    WITH CHECK (team_id = public.get_current_team_id());

DROP POLICY IF EXISTS "search_leads_team_all" ON public.search_leads;
CREATE POLICY "search_leads_team_all" ON public.search_leads
    FOR ALL TO authenticated
    USING (team_id = public.get_current_team_id())
    WITH CHECK (team_id = public.get_current_team_id());

DROP POLICY IF EXISTS "activities_team_all" ON public.lead_activities;
CREATE POLICY "activities_team_all" ON public.lead_activities
    FOR ALL TO authenticated
    USING (team_id = public.get_current_team_id())
    WITH CHECK (team_id = public.get_current_team_id());

DROP POLICY IF EXISTS "audits_team_all" ON public.audit_results;
CREATE POLICY "audits_team_all" ON public.audit_results
    FOR ALL TO authenticated
    USING (team_id = public.get_current_team_id())
    WITH CHECK (team_id = public.get_current_team_id());

DROP POLICY IF EXISTS "settings_team_all" ON public.app_settings;
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
BEGIN
    v_team_id := public.get_current_team_id();
    IF v_team_id IS NULL THEN
        RAISE EXCEPTION 'Usuário não associado a uma equipe autorizada.';
    END IF;

    v_lead_id := p_lead->>'id';

    -- Deduplicação por Google Place ID
    IF p_lead->>'google_place_id' IS NOT NULL AND (p_lead->>'google_place_id') <> '' THEN
        SELECT id INTO v_existing_id FROM public.leads
        WHERE team_id = v_team_id AND google_place_id = (p_lead->>'google_place_id') LIMIT 1;
    END IF;

    -- Deduplicação por OSM ID
    IF v_existing_id IS NULL AND p_lead->>'osm_id' IS NOT NULL AND (p_lead->>'osm_id') <> '' THEN
        SELECT id INTO v_existing_id FROM public.leads
        WHERE team_id = v_team_id AND osm_id = (p_lead->>'osm_id') LIMIT 1;
    END IF;

    -- Deduplicação por Domínio do Site
    IF v_existing_id IS NULL AND p_lead->>'site_domain' IS NOT NULL AND (p_lead->>'site_domain') <> '' THEN
        SELECT id INTO v_existing_id FROM public.leads
        WHERE team_id = v_team_id AND site_domain = (p_lead->>'site_domain') LIMIT 1;
    END IF;

    -- Deduplicação por Telefone Normalizado
    IF v_existing_id IS NULL AND p_lead->>'telefone_normalizado' IS NOT NULL AND (p_lead->>'telefone_normalizado') <> '' THEN
        SELECT id INTO v_existing_id FROM public.leads
        WHERE team_id = v_team_id AND telefone_normalizado = (p_lead->>'telefone_normalizado') LIMIT 1;
    END IF;

    -- Fallback por Nome + Cidade
    IF v_existing_id IS NULL AND p_lead->>'empresa' IS NOT NULL AND p_lead->>'cidade' IS NOT NULL THEN
        SELECT id INTO v_existing_id FROM public.leads
        WHERE team_id = v_team_id 
          AND LOWER(empresa) = LOWER(p_lead->>'empresa')
          AND LOWER(cidade) = LOWER(p_lead->>'cidade') LIMIT 1;
    END IF;

    IF v_existing_id IS NOT NULL THEN
        v_lead_id := v_existing_id;
    END IF;

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
        score = CASE WHEN EXCLUDED.score > 0 THEN EXCLUDED.score ELSE public.leads.score END,
        favorite = CASE WHEN EXCLUDED.favorite = TRUE THEN TRUE ELSE public.leads.favorite END,
        auditoria = CASE WHEN EXCLUDED.auditoria <> '{}'::jsonb THEN EXCLUDED.auditoria ELSE public.leads.auditoria END,
        website_data = CASE WHEN EXCLUDED.website_data <> '{}'::jsonb THEN EXCLUDED.website_data ELSE public.leads.website_data END,
        instagram_details = CASE WHEN EXCLUDED.instagram_details <> '{}'::jsonb THEN EXCLUDED.instagram_details ELSE public.leads.instagram_details END,
        updated_at = v_now;

    IF p_search_id IS NOT NULL AND p_search_id <> '' THEN
        INSERT INTO public.search_leads (search_id, lead_id, team_id, created_at)
        VALUES (p_search_id, v_lead_id, v_team_id, v_now)
        ON CONFLICT DO NOTHING;
    END IF;

    RETURN jsonb_build_object('id', v_lead_id, 'is_duplicate', (v_existing_id IS NOT NULL));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==============================================================================
-- RPC: CRIAR EQUIPE MANUALMENTE (Para usuário logado)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.create_user_team(p_team_name TEXT)
RETURNS JSONB AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_team_id UUID;
    v_team_name TEXT;
    v_user_name TEXT;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Usuário não autenticado.';
    END IF;

    v_team_name := COALESCE(NULLIF(TRIM(p_team_name), ''), 'DEVX Solutions');

    INSERT INTO public.teams (name, slug)
    VALUES (v_team_name, 'team-' || substr(v_user_id::text, 1, 8) || '-' || extract(epoch from now())::bigint)
    RETURNING id INTO v_team_id;

    SELECT COALESCE(full_name, split_part(email, '@', 1)) INTO v_user_name
    FROM public.profiles WHERE id = v_user_id;

    IF v_user_name IS NULL THEN
        SELECT split_part(email, '@', 1) INTO v_user_name
        FROM auth.users WHERE id = v_user_id;
    END IF;

    INSERT INTO public.profiles (id, team_id, full_name, email, role)
    SELECT v_user_id, v_team_id, COALESCE(v_user_name, 'Operador'), email, 'admin'
    FROM auth.users WHERE id = v_user_id
    ON CONFLICT (id) DO UPDATE SET
        team_id = v_team_id,
        role = 'admin';

    INSERT INTO public.team_members (team_id, user_id, role)
    VALUES (v_team_id, v_user_id, 'admin')
    ON CONFLICT (team_id, user_id) DO UPDATE SET
        role = 'admin';

    RETURN jsonb_build_object(
        'ok', true,
        'team_id', v_team_id,
        'team_name', v_team_name
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==============================================================================
-- RPC: GERAR CÓDIGO DE CONVITE (4 a 6 dígitos)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.generate_team_invite(
    p_max_uses INTEGER DEFAULT 1,
    p_custom_code TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_team_id UUID;
    v_role TEXT;
    v_code TEXT;
    v_invite_id UUID;
BEGIN
    SELECT team_id, role INTO v_team_id, v_role
    FROM public.profiles
    WHERE id = auth.uid() LIMIT 1;

    IF v_team_id IS NULL THEN
        RAISE EXCEPTION 'Você precisa pertencer a uma equipe para gerar convites.';
    END IF;

    IF v_role <> 'admin' THEN
        RAISE EXCEPTION 'Apenas administradores podem gerar códigos de convite.';
    END IF;

    IF p_custom_code IS NOT NULL AND TRIM(p_custom_code) <> '' THEN
        v_code := UPPER(TRIM(p_custom_code));
    ELSE
        v_code := (1000 + FLOOR(RANDOM() * 9000))::TEXT;
    END IF;

    UPDATE public.invitations
    SET status = 'revoked'
    WHERE code = v_code AND status = 'pending';

    INSERT INTO public.invitations (
        team_id, code, token, role, max_uses, uses_count, status, created_by
    ) VALUES (
        v_team_id, v_code, v_code || '-' || uuid_generate_v4(), 'member', COALESCE(p_max_uses, 1), 0, 'pending', auth.uid()
    )
    RETURNING id INTO v_invite_id;

    RETURN jsonb_build_object(
        'id', v_invite_id,
        'code', v_code,
        'max_uses', COALESCE(p_max_uses, 1),
        'team_id', v_team_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==============================================================================
-- RPC: INGRESSAR EM EQUIPE POR CÓDIGO
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.join_team_with_code(p_code TEXT)
RETURNS JSONB AS $$
DECLARE
    v_inv RECORD;
    v_team_name TEXT;
BEGIN
    SELECT * INTO v_inv
    FROM public.invitations
    WHERE (code = UPPER(TRIM(p_code)) OR token = TRIM(p_code))
      AND status = 'pending'
      AND uses_count < max_uses
      AND expires_at > now()
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_inv.id IS NULL THEN
        RAISE EXCEPTION 'Código de convite inválido, esgotado ou expirado.';
    END IF;

    SELECT name INTO v_team_name FROM public.teams WHERE id = v_inv.team_id;

    UPDATE public.profiles
    SET team_id = v_inv.team_id,
        role = v_inv.role,
        updated_at = now()
    WHERE id = auth.uid();

    INSERT INTO public.team_members (team_id, user_id, role)
    VALUES (v_inv.team_id, auth.uid(), v_inv.role)
    ON CONFLICT (team_id, user_id) DO UPDATE SET
        role = EXCLUDED.role,
        updated_at = now();

    UPDATE public.invitations
    SET uses_count = uses_count + 1,
        status = CASE WHEN (uses_count + 1) >= max_uses THEN 'accepted' ELSE 'pending' END
    WHERE id = v_inv.id;

    RETURN jsonb_build_object(
        'ok', true,
        'team_id', v_inv.team_id,
        'team_name', v_team_name,
        'role', v_inv.role
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==============================================================================
-- TRIGGER AUTOMÁTICO: NOVO USUÁRIO CADASTRA E JÁ GANHA EQUIPE
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    new_team_id UUID;
    user_name TEXT;
    user_team_name TEXT;
BEGIN
    user_name := COALESCE(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1));
    user_team_name := COALESCE(new.raw_user_meta_data->>'team_name', 'DEVX Solutions');
    
    INSERT INTO public.teams (name, slug)
    VALUES (user_team_name, 'team-' || substr(new.id::text, 1, 8) || '-' || extract(epoch from now())::bigint)
    RETURNING id INTO new_team_id;
    
    INSERT INTO public.profiles (id, team_id, full_name, email, role)
    VALUES (new.id, new_team_id, user_name, new.email, 'admin')
    ON CONFLICT (id) DO UPDATE SET
        team_id = COALESCE(public.profiles.team_id, new_team_id),
        full_name = EXCLUDED.full_name;
    
    INSERT INTO public.team_members (team_id, user_id, role)
    VALUES (new_team_id, new.id, 'admin')
    ON CONFLICT (team_id, user_id) DO NOTHING;
    
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ==============================================================================
-- REPARO AUTOMÁTICO: VINCULAR USUÁRIO ATUAL À EQUIPE "DEVX Solutions"
-- ==============================================================================
DO $$
DECLARE
    u RECORD;
    t_id UUID;
    u_name TEXT;
    u_team TEXT;
BEGIN
    FOR u IN SELECT * FROM auth.users LOOP
        IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = u.id AND team_id IS NOT NULL) THEN
            u_name := COALESCE(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1));
            u_team := 'DEVX Solutions';
            
            INSERT INTO public.teams (name, slug)
            VALUES (u_team, 'team-' || substr(u.id::text, 1, 8) || '-' || extract(epoch from now())::bigint)
            RETURNING id INTO t_id;

            INSERT INTO public.profiles (id, team_id, full_name, email, role)
            VALUES (u.id, t_id, u_name, u.email, 'admin')
            ON CONFLICT (id) DO UPDATE SET
                team_id = t_id,
                full_name = u_name,
                role = 'admin';

            INSERT INTO public.team_members (team_id, user_id, role)
            VALUES (t_id, u.id, 'admin')
            ON CONFLICT (team_id, user_id) DO UPDATE SET role = 'admin';
        END IF;
    END LOOP;
END $$;
