import { createClient } from '@supabase/supabase-js';
import { logger } from '../utils/logger.js';

let supabaseInstance = null;
let currentSession = null;
let currentProfile = null;

export function isSupabaseConfigured() {
  const url = process.env.SUPABASE_URL || '';
  const anonKey = process.env.SUPABASE_ANON_KEY || '';
  return Boolean(url && anonKey && url.startsWith('http'));
}

export function getSupabase() {
  if (supabaseInstance) return supabaseInstance;

  const url = process.env.SUPABASE_URL || '';
  const anonKey = process.env.SUPABASE_ANON_KEY || '';

  if (!url || !anonKey) {
    return null;
  }

  supabaseInstance = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false
    },
    realtime: {
      params: {
        eventsPerSecond: 5
      }
    }
  });

  return supabaseInstance;
}

export async function ensureProfileAndTeam(user, fullName = '', teamName = '') {
  const supabase = getSupabase();
  if (!supabase || !user) return null;

  try {
    let { data: profile } = await supabase
      .from('profiles')
      .select('*, teams(*)')
      .eq('id', user.id)
      .maybeSingle();

    if (profile && profile.team_id) {
      currentProfile = profile;
      return profile;
    }

    // Criar equipe se não existir
    let teamId = profile?.team_id;
    if (!teamId) {
      const name = teamName || `Equipe ${fullName || user.email.split('@')[0]}`;
      const slug = `team-${user.id.substring(0, 8)}-${Date.now()}`;
      const { data: newTeam, error: teamErr } = await supabase
        .from('teams')
        .insert({ name, slug })
        .select()
        .maybeSingle();

      if (!teamErr && newTeam) {
        teamId = newTeam.id;
      }
    }

    // Criar/atualizar perfil vinculado
    const profileData = {
      id: user.id,
      team_id: teamId || null,
      full_name: fullName || user.email.split('@')[0],
      email: user.email,
      role: 'admin'
    };

    const { data: updatedProfile } = await supabase
      .from('profiles')
      .upsert(profileData)
      .select('*, teams(*)')
      .maybeSingle();

    if (updatedProfile) {
      currentProfile = updatedProfile;
      return updatedProfile;
    }
  } catch (err) {
    logger.warn('Aviso ao sincronizar perfil e equipe do usuário:', { error: err.message });
  }

  return currentProfile;
}

export async function getCurrentUser() {
  const supabase = getSupabase();
  if (!supabase) return null;

  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return null;

    if (!currentProfile || currentProfile.id !== user.id) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('*, teams(*)')
        .eq('id', user.id)
        .maybeSingle();
      
      if (!profile || !profile.team_id) {
        await ensureProfileAndTeam(user);
      } else {
        currentProfile = profile;
      }
    }

    return { user, profile: currentProfile };
  } catch (error) {
    logger.warn('Erro ao obter usuário atual do Supabase', { error: error.message });
    return null;
  }
}

export async function signUp(email, password, fullName = '', teamName = '', inviteCode = '') {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase não configurado neste ambiente.');

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName || email.split('@')[0],
        team_name: teamName || `Equipe ${fullName || email.split('@')[0]}`,
        invite_code: inviteCode || null
      }
    }
  });

  if (error) throw error;

  if (data.session) {
    currentSession = data.session;
    currentProfile = null;
    
    if (inviteCode && inviteCode.trim()) {
      try {
        await joinTeamWithCode(inviteCode.trim());
      } catch (joinErr) {
        logger.warn('Erro ao ingressar com código de convite:', { error: joinErr.message });
      }
    } else {
      await ensureProfileAndTeam(data.user, fullName, teamName);
    }
  }

  return {
    user: data.user,
    session: data.session,
    requiresConfirmation: !data.session
  };
}

export async function joinTeamWithCode(code) {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase não configurado neste ambiente.');

  const cleanCode = code.trim().toUpperCase();

  // 1. Tentar RPC no Supabase
  const { data, error } = await supabase.rpc('join_team_with_code', { p_code: cleanCode });
  if (error) {
    // Fallback: busca direta se a RPC ainda não tiver sido executada no Supabase
    const { data: inv, error: invErr } = await supabase
      .from('invitations')
      .select('*, teams(*)')
      .or(`code.eq.${cleanCode},token.eq.${cleanCode}`)
      .eq('status', 'pending')
      .maybeSingle();

    if (invErr || !inv) {
      throw new Error('Código de convite não encontrado, já utilizado ou expirado.');
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Usuário não autenticado.');

    await supabase.from('profiles').upsert({
      id: user.id,
      team_id: inv.team_id,
      role: inv.role || 'member',
      email: user.email,
      full_name: user.user_metadata?.full_name || user.email.split('@')[0]
    });

    await supabase.from('team_members').upsert({
      team_id: inv.team_id,
      user_id: user.id,
      role: inv.role || 'member'
    });

    await supabase.from('invitations').update({
      uses_count: (inv.uses_count || 0) + 1,
      status: (inv.uses_count || 0) + 1 >= (inv.max_uses || 1) ? 'accepted' : 'pending'
    }).eq('id', inv.id);

    currentProfile = null;
    await getCurrentUser();
    return { success: true, team_name: inv.teams?.name };
  }

  currentProfile = null;
  await getCurrentUser();
  return data;
}

export async function generateTeamInvite(maxUses = 1, customCode = null) {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase não configurado neste ambiente.');

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Usuário não autenticado.');

  const userSession = await getCurrentUser();
  const teamId = userSession?.profile?.team_id;
  if (!teamId) throw new Error('Você precisa ter uma equipe criada para gerar convites.');

  const code = customCode && customCode.trim()
    ? customCode.trim().toUpperCase()
    : String(Math.floor(1000 + Math.random() * 9000)); // Ex: 1010, 4829

  // Tentar via RPC
  const { data: rpcData, error: rpcErr } = await supabase.rpc('generate_team_invite', {
    p_max_uses: Number(maxUses || 1),
    p_custom_code: code
  });

  if (!rpcErr && rpcData) {
    return rpcData;
  }

  // Fallback direto
  const { data: insertData, error: insertErr } = await supabase
    .from('invitations')
    .insert({
      team_id: teamId,
      code,
      token: `${code}-${Date.now()}`,
      role: 'member',
      max_uses: Number(maxUses || 1),
      uses_count: 0,
      status: 'pending',
      created_by: user.id
    })
    .select()
    .single();

  if (insertErr) throw insertErr;
  return { code, max_uses: maxUses, team_id: teamId, id: insertData?.id };
}

export async function getTeamInfo() {
  const supabase = getSupabase();
  if (!supabase) return null;

  const userSession = await getCurrentUser();
  if (!userSession?.profile?.team_id) return null;

  const teamId = userSession.profile.team_id;

  try {
    const [teamRes, membersRes, invitesRes] = await Promise.all([
      supabase.from('teams').select('*').eq('id', teamId).single(),
      supabase.from('profiles').select('*').eq('team_id', teamId).order('created_at', { ascending: true }),
      supabase.from('invitations').select('*').eq('team_id', teamId).eq('status', 'pending').order('created_at', { ascending: false })
    ]);

    return {
      team: teamRes.data || null,
      currentUserRole: userSession.profile.role || 'member',
      members: membersRes.data || [],
      invitations: invitesRes.data || []
    };
  } catch (err) {
    logger.warn('Erro ao carregar detalhes da equipe:', { error: err.message });
    return null;
  }
}

export async function signIn(email, password) {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase não configurado neste ambiente.');

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  currentSession = data.session;
  currentProfile = null;
  await ensureProfileAndTeam(data.user);
  return data;
}

export async function signOut() {
  const supabase = getSupabase();
  if (supabase) {
    await supabase.auth.signOut().catch(() => {});
  }
  currentSession = null;
  currentProfile = null;
}
