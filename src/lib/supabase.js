import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null

export function isSupabaseConfigured() {
  return Boolean(supabase && supabaseUrl && supabaseAnonKey)
}

export async function signUpWithEmail({ email, password, firstName, lastName, nexusId, redirectTo }) {
  if (!supabase) throw new Error('Supabase Auth is not configured.')
  const { data, error } = await supabase.auth.signUp({
    email: String(email || '').trim().toLowerCase(),
    password,
    options: {
      emailRedirectTo: redirectTo,
      data: {
        first_name: String(firstName || '').trim(),
        last_name: String(lastName || '').trim(),
        member_id: nexusId,
      },
    },
  })
  if (error) throw error
  return data
}

export async function verifySignupEmail(email, token) {
  if (!supabase) throw new Error('Supabase Auth is not configured.')
  const { data, error } = await supabase.auth.verifyOtp({
    email: String(email || '').trim().toLowerCase(),
    token: String(token || '').trim(),
    type: 'email',
  })
  if (error) throw error
  return data
}

export async function resendSignupEmail(email) {
  if (!supabase) throw new Error('Supabase Auth is not configured.')
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email: String(email || '').trim().toLowerCase(),
  })
  if (error) throw error
}

export async function signInWithEmail(email, password) {
  if (!supabase) throw new Error('Supabase Auth is not configured.')
  const { data, error } = await supabase.auth.signInWithPassword({
    email: String(email || '').trim().toLowerCase(),
    password,
  })
  if (error) throw error
  return data
}

export async function signOutFromSupabase() {
  if (!supabase) return
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

export async function sendPasswordRecovery(email, redirectTo) {
  if (!supabase) throw new Error('Supabase Auth is not configured.')
  const { error } = await supabase.auth.resetPasswordForEmail(
    String(email || '').trim().toLowerCase(),
    { redirectTo }
  )
  if (error) throw error
}

export async function updateAuthenticatedPassword(password) {
  if (!supabase) throw new Error('Supabase Auth is not configured.')
  const { data, error } = await supabase.auth.updateUser({ password })
  if (error) throw error
  return data
}

export async function getMemberProfile(userId) {
  if (!supabase) throw new Error('Supabase Auth is not configured.')
  const { data, error } = await supabase
    .from('members')
    .select('id, member_id, first_name, last_name, full_name, email, email_verified, role, avatar_url, created_at')
    .eq('id', userId)
    .single()
  if (error) throw error
  return data
}

export async function updateMemberProfile(userId, updates) {
  if (!supabase) throw new Error('Supabase Auth is not configured.')
  const profileUpdates = {}
  if (updates.firstName !== undefined) profileUpdates.first_name = updates.firstName
  if (updates.lastName !== undefined) profileUpdates.last_name = updates.lastName
  if (updates.fullName !== undefined) profileUpdates.full_name = updates.fullName
  if (updates.avatarUrl !== undefined) profileUpdates.avatar_url = updates.avatarUrl

  const { data, error } = await supabase
    .from('members')
    .update(profileUpdates)
    .eq('id', userId)
    .select('id, member_id, first_name, last_name, full_name, email, email_verified, role, avatar_url, created_at')
    .single()
  if (error) throw error
  return data
}

export function getSupabaseConfig() {
  return {
    url: supabaseUrl,
    anonKey: supabaseAnonKey,
    configured: isSupabaseConfigured(),
  }
}
