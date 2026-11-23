-- ==============================================================================
-- RADARXL 2.0 - REGISTRO DE USUÁRIOS E CRIAÇÃO AUTOMÁTICA DE EQUIPES
-- ==============================================================================

-- 1. Políticas de Inserção para Autenticação
CREATE POLICY "teams_insert_authenticated" ON public.teams
    FOR INSERT TO authenticated
    WITH CHECK (true);

CREATE POLICY "profiles_insert_own" ON public.profiles
    FOR INSERT TO authenticated
    WITH CHECK (id = auth.uid());

CREATE POLICY "team_members_insert_own" ON public.team_members
    FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());

-- 2. Trigger Automático no Supabase Auth:
-- Quando um usuário se cadastra no Supabase, cria automaticamente:
-- a) Equipe padrão
-- b) Perfil admin vinculado
-- c) Associação em team_members
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    new_team_id UUID;
    user_name TEXT;
    user_team_name TEXT;
BEGIN
    user_name := COALESCE(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1));
    user_team_name := COALESCE(new.raw_user_meta_data->>'team_name', 'Equipe ' || user_name);
    
    -- Cria a equipe
    INSERT INTO public.teams (name, slug)
    VALUES (user_team_name, 'team-' || substr(new.id::text, 1, 8) || '-' || extract(epoch from now())::bigint)
    RETURNING id INTO new_team_id;
    
    -- Cria o perfil vinculado à equipe
    INSERT INTO public.profiles (id, team_id, full_name, email, role)
    VALUES (new.id, new_team_id, user_name, new.email, 'admin')
    ON CONFLICT (id) DO UPDATE SET
        team_id = COALESCE(public.profiles.team_id, new_team_id),
        full_name = EXCLUDED.full_name;
    
    -- Cria vínculo em team_members
    INSERT INTO public.team_members (team_id, user_id, role)
    VALUES (new_team_id, new.id, 'admin')
    ON CONFLICT (team_id, user_id) DO NOTHING;
    
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ativa o trigger para novos usuários cadastrados
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
