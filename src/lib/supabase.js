import { createClient } from '@supabase/supabase-js'

const runtimeEnv = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env : (typeof process !== 'undefined' ? process.env : {})
const supabaseUrl = runtimeEnv.VITE_SUPABASE_URL || runtimeEnv.SUPABASE_URL || ''
const supabaseAnonKey = runtimeEnv.VITE_SUPABASE_ANON_KEY || runtimeEnv.SUPABASE_ANON_KEY || ''

export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    })
  : null

export function isSupabaseConfigured() {
  return Boolean(supabase && supabaseUrl && supabaseAnonKey)
}

export async function findMemberBySupabaseNexusId(nexusId) {
  if (!supabase) return null

  const normalizedId = String(nexusId || '').replace(/\D/g, '')
  if (!normalizedId) return null

  const { data, error } = await supabase
    .from('members')
    .select('*')
    .eq('member_id', normalizedId)
    .maybeSingle()

  if (error) {
    console.warn('Supabase member lookup failed', error)
    return null
  }

  return data
}

export async function createSupabaseMember(member) {
  if (!supabase) return null

  const { data, error } = await supabase
    .from('members')
    .insert(member)
    .select()
    .maybeSingle()

  if (error) {
    console.warn('Supabase member create failed', error)
    return null
  }

  return data
}

export async function updateSupabaseMemberByNexusId(nexusId, updates) {
  if (!supabase) return null

  const normalizedId = String(nexusId || '').replace(/\D/g, '')
  if (!normalizedId) return null

  const { data, error } = await supabase
    .from('members')
    .update(updates)
    .eq('member_id', normalizedId)
    .select()
    .maybeSingle()

  if (error) {
    console.warn('Supabase member update failed', error)
    return null
  }

  return data
}

export function getSupabaseConfig() {
  return {
    url: supabaseUrl,
    anonKey: supabaseAnonKey,
    configured: isSupabaseConfigured(),
  }
}
