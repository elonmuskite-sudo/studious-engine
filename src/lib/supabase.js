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

async function requestEmailCode(body) {
  const response = await fetch('/api/auth/email-code', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(result.error || 'Could not send the email code.')
    error.verificationPending = Boolean(result.verificationPending)
    throw error
  }
  return result
}

export async function startSignupEmailCode({ email, password, firstName, lastName, memberId }) {
  return requestEmailCode({
    action: 'signup',
    purpose: 'signup',
    email,
    password,
    firstName,
    lastName,
    memberId,
  })
}

export async function verifyEmailCode(email, token, type = 'signup') {
  if (!supabase) throw new Error('Supabase Auth is not configured.')
  const { data, error } = await supabase.auth.verifyOtp({
    email: String(email || '').trim().toLowerCase(),
    token: String(token || '').trim(),
    type,
  })
  if (error) throw error
  return data
}

export async function resendEmailCode(email, purpose) {
  return requestEmailCode({
    action: 'resend',
    purpose,
    email,
  })
}

export async function clearPendingEmailCode(email, purpose) {
  return requestEmailCode({
    action: 'clear',
    purpose,
    email,
  })
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

export async function startPasswordRecoveryCode(email) {
  return requestEmailCode({
    action: 'recovery',
    purpose: 'recovery',
    email,
  })
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
