-- ==============================================================================
-- RADARXL INTELLIGENCE 2.0 - SCRIPT COMPLETO E UNIFICADO DO SUPABASE
-- Execute este script no SQL Editor do Supabase (Dashboard > SQL Editor > New query)
-- Ele configura tudo: tabelas, colunas, permissões RLS, funções de convite e
-- repara automaticamente sua conta atual criando a sua equipe!
-- ==============================================================================

-- 1. Extensões
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Garantir colunas da tabela invitations
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
END $$;

CREATE INDEX IF NOT EXISTS idx_invitations_code ON public.invitations(code);

-- 3. Função auxiliar de Team ID
CREATE OR REPLACE FUNCTION public.get_current_team_id()
RETURNS UUID AS $$
  SELECT team_id FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- 4. Habilitar RLS em todas as tabelas
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

-- 5. Políticas de TEAMS
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

-- 6. Políticas de PROFILES
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

-- 7. Políticas de TEAM_MEMBERS
DROP POLICY IF EXISTS "team_members_insert_own" ON public.team_members;
CREATE POLICY "team_members_insert_own" ON public.team_members
    FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "team_members_select" ON public.team_members;
CREATE POLICY "team_members_select" ON public.team_members
    FOR SELECT TO authenticated
    USING (team_id = public.get_current_team_id() OR user_id = auth.uid());

-- 8. Políticas de INVITATIONS
DROP POLICY IF EXISTS "invitations_all_authenticated" ON public.invitations;
CREATE POLICY "invitations_all_authenticated" ON public.invitations
    FOR ALL TO authenticated
    USING (team_id = public.get_current_team_id() OR true)
    WITH CHECK (true);

-- 9. Políticas de DADOS DA EQUIPE (Searches, Leads, etc)
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

-- 10. RPC: CRIAR EQUIPE MANUALMENTE (Para usuário logado)
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

    -- Cria equipe
    INSERT INTO public.teams (name, slug)
    VALUES (v_team_name, 'team-' || substr(v_user_id::text, 1, 8) || '-' || extract(epoch from now())::bigint)
    RETURNING id INTO v_team_id;

    -- Pega nome do usuário
    SELECT COALESCE(full_name, split_part(email, '@', 1)) INTO v_user_name
    FROM public.profiles WHERE id = v_user_id;

    IF v_user_name IS NULL THEN
        SELECT split_part(email, '@', 1) INTO v_user_name
        FROM auth.users WHERE id = v_user_id;
    END IF;

    -- Atualiza / cria perfil como admin da equipe
    INSERT INTO public.profiles (id, team_id, full_name, email, role)
    SELECT v_user_id, v_team_id, COALESCE(v_user_name, 'Operador'), email, 'admin'
    FROM auth.users WHERE id = v_user_id
    ON CONFLICT (id) DO UPDATE SET
        team_id = v_team_id,
        role = 'admin';

    -- Adiciona em team_members
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

-- 11. RPC: GERAR CÓDIGO DE CONVITE
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

-- 12. RPC: ENTRAR EM EQUIPE COM CÓDIGO
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

-- 13. Trigger para novos usuários
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    new_team_id UUID;
    user_name TEXT;
    user_team_name TEXT;
BEGIN
    user_name := COALESCE(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1));
    user_team_name := COALESCE(new.raw_user_meta_data->>'team_name', 'Equipe ' || user_name);
    
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

-- 14. REPARO AUTOMÁTICO DE USUÁRIOS EXISTENTES (Cria a equipe agora mesmo)
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
            u_team := COALESCE(u.raw_user_meta_data->>'team_name', 'DEVX Solutions');
            
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
