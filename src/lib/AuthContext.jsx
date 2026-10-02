import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react'
import { databases, isAppwriteDataAvailable, isAdminRole, APPWRITE_DATABASE_ID, ID, Query, getAppwriteConfig } from './appwrite'
import { ADMIN_DEFAULTS } from './appwriteSchema'
import { requestPasswordReset as requestResetToken, resetPasswordWithToken as resetStoredPassword } from './authReset'
import { supabase, isSupabaseConfigured, findMemberBySupabaseNexusId, createSupabaseMember, updateSupabaseMemberByNexusId } from './supabase'

const AuthContext = createContext()
const SESSION_STORAGE_KEY = 'nexus-chat-session'
const USER_STORAGE_KEY = 'nexus-chat-users'

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

function generateNexusId(existingUsers) {
  const usedIds = new Set(existingUsers.map((user) => user.nexus_id || user.nexusId || user.member_id || user.memberId))
  let candidate = ''
  do {
    const randomSuffix = String(Math.floor(Math.random() * 100000000)).padStart(8, '0')
    candidate = `10${randomSuffix}`
  } while (usedIds.has(candidate))
  return candidate
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

function readStoredUsers() {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(USER_STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function writeStoredUsers(users) {
  if (typeof window === 'undefined') return
  localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(users))
}

function buildAdminUser(overrides = {}) {
  const config = getAppwriteConfig()
  const memberId = String(overrides.member_id || config.adminMemberId || ADMIN_DEFAULTS.memberId).replace(/\D/g, '')
  return {
    member_id: memberId,
    nexus_id: memberId,
    first_name: ADMIN_DEFAULTS.firstName,
    last_name: ADMIN_DEFAULTS.lastName,
    full_name: ADMIN_DEFAULTS.fullName,
    email: overrides.email || config.adminEmail || ADMIN_DEFAULTS.email,
    email_verified: true,
    role: 'admin',
    password: overrides.password || config.adminPassword || ADMIN_DEFAULTS.password,
    created_at: overrides.created_at || new Date().toISOString(),
    ...overrides,
  }
}

function ensureLocalAdmin() {
  const users = readStoredUsers()
  const adminId = String(getAppwriteConfig().adminMemberId || ADMIN_DEFAULTS.memberId).replace(/\D/g, '')
  const exists = users.some((user) => String(user.member_id || user.nexusId || user.nexus_id || '').replace(/\D/g, '') === adminId)
  if (exists) return
  writeStoredUsers([buildAdminUser(), ...users])
}

function matchAdminCredentials(nexusId, password) {
  const config = getAppwriteConfig()
  const adminId = String(config.adminMemberId || ADMIN_DEFAULTS.memberId).replace(/\D/g, '')
  const adminPassword = String(config.adminPassword || ADMIN_DEFAULTS.password)
  if (String(nexusId) !== adminId) return null
  if (String(password || '').trim() !== adminPassword.trim()) return null
  return normalizeUser(buildAdminUser({ member_id: adminId, password: adminPassword }))
}

async function findMemberByNexusId(normalizedId) {
  const request = databases.listDocuments(APPWRITE_DATABASE_ID, 'members', [
    Query.equal('member_id', normalizedId),
    Query.limit(1),
  ])
  const timeout = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('Appwrite member lookup timed out.')), 3000)
  })
  const { documents } = await Promise.race([request, timeout])
  return documents?.[0] || null
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ensureLocalAdmin()
    const checkAuth = async () => {
      try {
        const cachedSession = typeof window !== 'undefined' ? localStorage.getItem(SESSION_STORAGE_KEY) : null
        if (cachedSession) {
          const parsed = JSON.parse(cachedSession)
          const storedNexusId = parsed.nexusId || parsed.member_id || parsed.memberId

          if (isAppwriteDataAvailable() && databases && storedNexusId) {
            try {
              const data = await findMemberByNexusId(String(storedNexusId))
              if (data) {
                setUser(normalizeUser(data))
                setLoading(false)
                return
              }
            } catch {
            }
          }

          if (isSupabaseConfigured() && storedNexusId) {
            try {
              const supabaseUser = await findMemberBySupabaseNexusId(String(storedNexusId))
              if (supabaseUser) {
                setUser(normalizeUser(supabaseUser))
                setLoading(false)
                return
              }
            } catch {
            }
          }

          setUser(normalizeUser(parsed))
          setLoading(false)
          return
        }

        setUser(null)
      } catch {
        const cachedSession = typeof window !== 'undefined' ? localStorage.getItem(SESSION_STORAGE_KEY) : null
        if (cachedSession) {
          setUser(normalizeUser(JSON.parse(cachedSession)))
        } else {
          setUser(null)
        }
      } finally {
        setLoading(false)
      }
    }

    checkAuth()
  }, [])

  const login = useCallback(async (nexusId, password) => {
    const normalizedId = String(nexusId || '').replace(/\D/g, '')
    const storedUsers = readStoredUsers()

    if (isAppwriteDataAvailable() && databases) {
      try {
        const data = await findMemberByNexusId(normalizedId)
        if (!data) {
          throw new Error('Nexus number not found. Please create an account first.')
        }
        if (String(password || '').trim() !== String(data.password || '').trim()) {
          throw new Error('Incorrect password for this Nexus number.')
        }

        const sessionUser = normalizeUser(data)
        if (typeof window !== 'undefined') {
          localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessionUser))
        }
        setUser(sessionUser)
        return { user: sessionUser, nexusId: sessionUser.nexusId }
      } catch (err) {
        if (storedUsers.length) {
          const fallbackUser = storedUsers.find((candidate) => (candidate.nexus_id || candidate.nexusId || candidate.member_id || candidate.memberId) === normalizedId)
          if (fallbackUser) {
            if (String(password || '').trim() !== String(fallbackUser.password || '').trim()) {
              throw new Error('Incorrect password for this Nexus number.')
            }
            const sessionUser = normalizeUser(fallbackUser)
            localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessionUser))
            setUser(sessionUser)
            return { user: sessionUser, nexusId: sessionUser.nexusId }
          }
        }

        if (isSupabaseConfigured() && supabase) {
          try {
            const supabaseUser = await findMemberBySupabaseNexusId(normalizedId)
            if (supabaseUser && String(password || '').trim() === String(supabaseUser.password || '').trim()) {
              const sessionUser = normalizeUser(supabaseUser)
              localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessionUser))
              setUser(sessionUser)
              return { user: sessionUser, nexusId: sessionUser.nexusId }
            }
          } catch {
          }
        }

        throw err
      }
    }

    if (isSupabaseConfigured() && supabase) {
      try {
        const supabaseUser = await findMemberBySupabaseNexusId(normalizedId)
        if (supabaseUser) {
          if (String(password || '').trim() !== String(supabaseUser.password || '').trim()) {
            throw new Error('Incorrect password for this Nexus number.')
          }
          const sessionUser = normalizeUser(supabaseUser)
          localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessionUser))
          setUser(sessionUser)
          return { user: sessionUser, nexusId: sessionUser.nexusId }
        }
      } catch {
      }
    }

    const fallbackUser = storedUsers.find((candidate) => (candidate.nexus_id || candidate.nexusId || candidate.member_id || candidate.memberId) === normalizedId)
    if (!fallbackUser) throw new Error('Nexus number not found. Please create an account first.')
    if (String(password || '').trim() !== String(fallbackUser.password || '').trim()) {
      throw new Error('Incorrect password for this Nexus number.')
    }
    const sessionUser = normalizeUser(fallbackUser)
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessionUser))
    setUser(sessionUser)
    return { user: sessionUser, nexusId: sessionUser.nexusId }
  }, [])

  const logout = useCallback(async () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(SESSION_STORAGE_KEY)
    }
    setUser(null)
  }, [])

  const register = useCallback(async ({ firstName, lastName, password }) => {
    const normalizedFirstName = String(firstName || '').trim()
    const normalizedLastName = String(lastName || '').trim()
    const storedUsers = readStoredUsers()
    const nexusId = generateNexusId(storedUsers)
    const generatedPassword = String(password || '').trim() || `${nexusId.slice(-4)}${Math.random().toString(36).slice(-4)}`
    const fullName = [normalizedFirstName, normalizedLastName].filter(Boolean).join(' ').trim()
    const createdAt = new Date().toISOString()

    const localUser = {
      id: `${Date.now()}`,
      member_id: nexusId,
      nexus_id: nexusId,
      nexusId,
      nexusIdDisplay: formatNexusIdForDisplay(nexusId),
      first_name: normalizedFirstName,
      firstName: normalizedFirstName,
      last_name: normalizedLastName,
      lastName: normalizedLastName,
      full_name: fullName,
      fullName,
      email: null,
      email_verified: false,
      emailVerified: false,
      role: 'user',
      password: generatedPassword,
      created_at: createdAt,
      createdAt,
    }

    if (isAppwriteDataAvailable() && databases) {
      try {
        const data = await databases.createDocument(APPWRITE_DATABASE_ID, 'members', ID.unique(), {
          member_id: nexusId,
          first_name: normalizedFirstName,
          last_name: normalizedLastName,
          full_name: fullName,
          password: generatedPassword,
          email: null,
          email_verified: false,
          role: 'user',
          avatar_url: null,
          created_at: createdAt,
        })
        const sessionUser = normalizeUser(data)
        sessionUser.nexusIdDisplay = formatNexusIdForDisplay(sessionUser.nexusId)
        if (typeof window !== 'undefined') {
          localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessionUser))
        }
        setUser(sessionUser)
        return { user: sessionUser, nexusId, password: generatedPassword }
      } catch {
        // fall through to Supabase/local fallback below
      }
    }

    if (isSupabaseConfigured() && supabase) {
      try {
        const data = await createSupabaseMember({
          member_id: nexusId,
          first_name: normalizedFirstName,
          last_name: normalizedLastName,
          full_name: fullName,
          password: generatedPassword,
          email: null,
          email_verified: false,
          role: 'user',
          avatar_url: null,
          created_at: createdAt,
        })

        if (data) {
          const sessionUser = normalizeUser(data)
          sessionUser.nexusIdDisplay = formatNexusIdForDisplay(sessionUser.nexusId)
          localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessionUser))
          setUser(sessionUser)
          return { user: sessionUser, nexusId, password: generatedPassword }
        }
      } catch {
        // fall back to local storage below
      }
    }

    const nextUsers = [localUser, ...storedUsers]
    writeStoredUsers(nextUsers)
    const sessionUser = normalizeUser(localUser)
    sessionUser.nexusIdDisplay = formatNexusIdForDisplay(sessionUser.nexusId)
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessionUser))
    setUser(sessionUser)
    return { user: sessionUser, nexusId, password: generatedPassword }
  }, [])

  const updateProfile = useCallback(async (updates) => {
    if (!user) return
    const updatedUser = {
      ...user,
      ...updates
    }

    if (typeof window !== 'undefined') {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(updatedUser))
    }
    setUser(updatedUser)

    const storedUsers = readStoredUsers()
    const updatedUsers = storedUsers.map(candidate => {
      const candidateId = candidate.nexus_id || candidate.nexusId || candidate.member_id || candidate.memberId
      if (candidateId === user.nexusId) {
        return {
          ...candidate,
          ...updates
        }
      }
      return candidate
    })
    writeStoredUsers(updatedUsers)

    if (isAppwriteDataAvailable() && databases) {
      try {
        const member = await findMemberByNexusId(user.nexusId)
        if (!member) return

        const appwriteUpdates = {}
        if (updates.firstName !== undefined) appwriteUpdates.first_name = updates.firstName
        if (updates.lastName !== undefined) appwriteUpdates.last_name = updates.lastName
        if (updates.fullName !== undefined) appwriteUpdates.full_name = updates.fullName
        if (updates.avatarUrl !== undefined) appwriteUpdates.avatar_url = updates.avatarUrl

        await databases.updateDocument(APPWRITE_DATABASE_ID, 'members', member.$id, appwriteUpdates)
      } catch (err) {
        console.error('Appwrite profile update failed', err)
      }
    }

    if (isSupabaseConfigured() && supabase) {
      try {
        await updateSupabaseMemberByNexusId(user.nexusId, {
          first_name: updates.firstName ?? user.firstName,
          last_name: updates.lastName ?? user.lastName,
          full_name: updates.fullName ?? user.fullName,
          avatar_url: updates.avatarUrl ?? user.avatarUrl,
        })
      } catch (err) {
        console.error('Supabase profile update failed', err)
      }
    }
  }, [user])

  const requestPasswordReset = useCallback(async (identifier) => {
    return requestResetToken(identifier)
  }, [])

  const resetPassword = useCallback(async (token, newPassword) => {
    const result = resetStoredPassword(token, newPassword)

    if (isAppwriteDataAvailable() && databases) {
      try {
        const member = await findMemberByNexusId(result.nexusId)
        if (member) {
          await databases.updateDocument(APPWRITE_DATABASE_ID, 'members', member.$id, {
            password: String(newPassword || '').trim(),
          })
        }
      } catch (err) {
        console.warn('Appwrite password update failed', err)
      }
    }

    if (isSupabaseConfigured() && supabase) {
      try {
        await updateSupabaseMemberByNexusId(result.nexusId, {
          password: String(newPassword || '').trim(),
        })
      } catch (err) {
        console.warn('Supabase password update failed', err)
      }
    }

    return result
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
