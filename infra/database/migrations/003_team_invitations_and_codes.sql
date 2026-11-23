-- ==============================================================================
-- RADARXL 2.0 - CÓDIGOS DE CONVITE E ENTRADA EM EQUIPE
-- ==============================================================================

-- 1. Adicionar colunas necessárias na tabela invitations se não existirem
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
    -- Permitir email nulo para códigos gerados sem destinatário prévio
    ALTER TABLE public.invitations ALTER COLUMN email DROP NOT NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_invitations_code ON public.invitations(code);

-- 2. Políticas de RLS para Invitations
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invitations_team_admin" ON public.invitations;
CREATE POLICY "invitations_team_admin" ON public.invitations
    FOR ALL TO authenticated
    USING (team_id = public.get_current_team_id())
    WITH CHECK (team_id = public.get_current_team_id());

-- 3. Função RPC: Gerar Código de Convite da Equipe (Uso Único ou Múltiplo)
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

    -- Gerar código de 4 a 6 dígitos se não fornecido customizado
    IF p_custom_code IS NOT NULL AND TRIM(p_custom_code) <> '' THEN
        v_code := UPPER(TRIM(p_custom_code));
    ELSE
        v_code := (1000 + FLOOR(RANDOM() * 9000))::TEXT; -- Ex: 1010, 4829
    END IF;

    -- Desativar código anterior idêntico pendente se existir
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

-- 4. Função RPC: Entrar em Equipe com Código
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
        RAISE EXCEPTION 'Código de convite inválido, expirado ou já utilizado.';
    END IF;

    SELECT name INTO v_team_name FROM public.teams WHERE id = v_inv.team_id;

    -- Vincula o usuário na tabela de profiles
    UPDATE public.profiles
    SET team_id = v_inv.team_id,
        role = v_inv.role,
        updated_at = timezone('utc'::text, now())
    WHERE id = auth.uid();

    -- Registra como membro da equipe
    INSERT INTO public.team_members (team_id, user_id, role)
    VALUES (v_inv.team_id, auth.uid(), v_inv.role)
    ON CONFLICT (team_id, user_id) DO UPDATE SET role = EXCLUDED.role;

    -- Incrementa contagem de usos do convite
    UPDATE public.invitations
    SET uses_count = uses_count + 1,
        status = CASE WHEN uses_count + 1 >= max_uses THEN 'accepted' ELSE 'pending' END
    WHERE id = v_inv.id;

    RETURN jsonb_build_object(
        'success', true,
        'team_id', v_inv.team_id,
        'team_name', v_team_name,
        'role', v_inv.role
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
