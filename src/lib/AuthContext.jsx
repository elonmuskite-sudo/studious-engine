import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react'
import { isAdminRole } from './appwrite'
import {
  getMemberProfile,
  isSupabaseConfigured,
  sendPasswordRecovery,
  signInWithEmail,
  signOutFromSupabase,
  signUpWithEmail,
  supabase,
  updateAuthenticatedPassword,
  updateMemberProfile,
} from './supabase'

const AuthContext = createContext()

function normalizeUser(user) {
  const rawRole = user.role || user.user_role || user.profile_role || 'user'
  return {
    id: user.id || user.$id,
    nexusId: user.nexus_id || user.nexusId || user.member_id || user.memberId,
    nexusIdDisplay: user.nexusIdDisplay || user.memberIdDisplay || formatNexusIdForDisplay(user.nexus_id || user.nexusId || user.member_id || user.memberId),
    firstName: user.first_name || user.firstName,
    lastName: user.last_name || user.lastName,
    fullName: user.full_name || user.fullName || `${user.first_name || user.firstName || ''} ${user.last_name || user.lastName || ''}`.trim(),
    email: user.email,
    emailVerified: user.email_verified || user.emailVerified || false,
    role: isAdminRole(rawRole) ? 'admin' : rawRole,
    avatarUrl: user.avatar_url || user.avatarUrl || null,
    createdAt: user.created_at || user.createdAt || user.$createdAt
  }
}

function formatNexusIdForDisplay(raw) {
  const s = String(raw || '').replace(/\D/g, '')
  if (s.length >= 2) {
    let formatted = s.slice(0, 2)
    if (s.length >= 6) {
      formatted += '-' + s.slice(2, 6)
      if (s.length >= 10) {
        formatted += '-' + s.slice(6, 10)
      }
    }
    return formatted
  }
  return s
}

function generateNexusId() {
  return `10${String(Math.floor(Math.random() * 100000000)).padStart(8, '0')}`
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('nexus-chat-users')
      window.localStorage.removeItem('nexus-chat-session')
    }
    if (!isSupabaseConfigured() || !supabase) {
      setLoading(false)
      return undefined
    }

    let active = true
    const syncSession = async (session) => {
      if (!active) return
      if (!session?.user) {
        setUser(null)
        setLoading(false)
        return
      }
      try {
        const profile = await getMemberProfile(session.user.id)
        if (!active) return
        setUser(normalizeUser({
          ...profile,
          email: session.user.email,
          email_verified: Boolean(session.user.email_confirmed_at),
        }))
      } catch (error) {
        console.error('Authenticated profile lookup failed', error)
        if (active) setUser(null)
      } finally {
        if (active) setLoading(false)
      }
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setTimeout(() => { void syncSession(session) }, 0)
    })
    supabase.auth.getSession()
      .then(({ data, error }) => {
        if (error) throw error
        return syncSession(data.session)
      })
      .catch((error) => {
        console.error('Supabase session lookup failed', error)
        if (active) {
          setUser(null)
          setLoading(false)
        }
      })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  const login = useCallback(async (email, password) => {
    if (!isSupabaseConfigured()) throw new Error('Account sign-in is not configured.')
    const { user: authUser } = await signInWithEmail(email, password)
    const profile = await getMemberProfile(authUser.id)
    const sessionUser = normalizeUser({
      ...profile,
      email: authUser.email,
      email_verified: Boolean(authUser.email_confirmed_at),
    })
    setUser(sessionUser)
    return { user: sessionUser, nexusId: sessionUser.nexusId }
  }, [])

  const logout = useCallback(async () => {
    await signOutFromSupabase()
    setUser(null)
  }, [])

  const register = useCallback(async ({ email, firstName, lastName, password }) => {
    if (!isSupabaseConfigured()) throw new Error('Account registration is not configured.')
    const normalizedEmail = String(email || '').trim().toLowerCase()
    const normalizedFirstName = String(firstName || '').trim()
    const normalizedLastName = String(lastName || '').trim()
    const cleanPassword = String(password || '')
    if (!normalizedEmail) throw new Error('Email is required.')
    if (cleanPassword.length < 8) throw new Error('Password must be at least 8 characters.')
    const nexusId = generateNexusId()
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    const { user: authUser, session } = await signUpWithEmail({
      email: normalizedEmail,
      password: cleanPassword,
      firstName: normalizedFirstName,
      lastName: normalizedLastName,
      nexusId,
      redirectTo: `${origin}/login`,
    })
    if (!authUser) throw new Error('Supabase did not return the new account.')

    let sessionUser = null
    if (session) {
      const profile = await getMemberProfile(authUser.id)
      sessionUser = normalizeUser({
        ...profile,
        email: authUser.email,
        email_verified: Boolean(authUser.email_confirmed_at),
      })
      setUser(sessionUser)
    }

    return { user: sessionUser, nexusId, needsEmailConfirmation: !session }
  }, [])

  const updateProfile = useCallback(async (updates) => {
    if (!user) return
    const profile = await updateMemberProfile(user.id, updates)
    setUser(normalizeUser({ ...profile, email: user.email, email_verified: user.emailVerified }))
  }, [user])

  const requestPasswordReset = useCallback(async (email) => {
    if (!isSupabaseConfigured()) throw new Error('Password recovery is not configured.')
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    await sendPasswordRecovery(email, `${origin}/reset-password`)
    return { ok: true }
  }, [])

  const resetPassword = useCallback(async (newPassword) => {
    if (String(newPassword || '').length < 8) {
      throw new Error('Password must be at least 8 characters.')
    }
    await updateAuthenticatedPassword(newPassword)
    await signOutFromSupabase()
    setUser(null)
    return { ok: true }
  }, [])

  const value = useMemo(() => ({
    user,
    loading,
    login,
    logout,
    register,
    updateProfile,
    requestPasswordReset,
    resetPassword,
  }), [user, loading, login, logout, register, updateProfile, requestPasswordReset, resetPassword])

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}

export { formatNexusIdForDisplay }
