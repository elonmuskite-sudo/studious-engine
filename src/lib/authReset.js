const USERS_STORAGE_KEY = 'nexus-chat-users'
const RESET_STORAGE_KEY = 'nexus-chat-password-resets'
const RESET_TTL_MS = 30 * 60 * 1000

function getStorage() {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage
  }

  const memoryStore = new Map()
  return {
    getItem(key) {
      return memoryStore.has(key) ? memoryStore.get(key) : null
    },
    setItem(key, value) {
      memoryStore.set(key, String(value))
    },
    removeItem(key) {
      memoryStore.delete(key)
    },
  }
}

function normalizeNexusId(value) {
  return String(value || '').replace(/\D/g, '')
}

export function readStoredUsers(storage = getStorage()) {
  try {
    const raw = storage.getItem(USERS_STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function writeStoredUsers(users, storage = getStorage()) {
  try {
    storage.setItem(USERS_STORAGE_KEY, JSON.stringify(users))
  } catch {
  }
  return users
}

function readResetTokens(storage = getStorage()) {
  try {
    const raw = storage.getItem(RESET_STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function writeResetTokens(tokens, storage = getStorage()) {
  storage.setItem(RESET_STORAGE_KEY, JSON.stringify(tokens))
}

export function findUserByIdentifier(users, identifier) {
  const value = String(identifier || '').trim()
  if (!value) return null

  const normalizedId = normalizeNexusId(value)
  const normalizedEmail = value.toLowerCase()

  return users.find((user) => {
    const userNexusId = normalizeNexusId(user.nexus_id || user.nexusId || user.member_id || user.memberId)
    const userEmail = String(user.email || '').trim().toLowerCase()
    return userNexusId === normalizedId || userEmail === normalizedEmail
  }) || null
}

export function requestPasswordReset(identifier, storage = getStorage()) {
  const users = readStoredUsers(storage)
  const user = findUserByIdentifier(users, identifier)

  if (!user) {
    return {
      ok: false,
      message: 'No account matches that Nexus number or email.',
    }
  }

  const token = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  const nexusId = normalizeNexusId(user.nexus_id || user.nexusId || user.member_id || user.memberId)
  const existing = readResetTokens(storage)
  const nextTokens = [
    ...existing.filter((entry) => entry.nexusId !== nexusId),
    {
      token,
      nexusId,
      createdAt: Date.now(),
    },
  ]

  writeResetTokens(nextTokens, storage)

  const resetUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/reset-password?token=${encodeURIComponent(token)}`
    : `/reset-password?token=${encodeURIComponent(token)}`

  return {
    ok: true,
    token,
    resetUrl,
    nexusId,
  }
}

export function resetPasswordWithToken(token, newPassword, storage = getStorage()) {
  const resetToken = String(token || '').trim()
  const password = String(newPassword || '').trim()

  if (!resetToken) {
    throw new Error('A reset token is required.')
  }

  if (password.length < 6) {
    throw new Error('Password must be at least 6 characters.')
  }

  const tokens = readResetTokens(storage)
  const resetEntry = tokens.find((entry) => entry.token === resetToken)

  if (!resetEntry) {
    throw new Error('This reset link is invalid or has already been used.')
  }

  const age = Date.now() - Number(resetEntry.createdAt || 0)
  if (age > RESET_TTL_MS) {
    writeResetTokens(tokens.filter((entry) => entry.token !== resetToken), storage)
    throw new Error('This reset link has expired. Please request a new one.')
  }

  const users = readStoredUsers(storage)
  const userIndex = users.findIndex((user) => {
    const candidateId = normalizeNexusId(user.nexus_id || user.nexusId || user.member_id || user.memberId)
    return candidateId === normalizeNexusId(resetEntry.nexusId)
  })

  if (userIndex === -1) {
    throw new Error('No account matches this reset link.')
  }

  const updatedUsers = [...users]
  updatedUsers[userIndex] = {
    ...updatedUsers[userIndex],
    password,
    updatedAt: new Date().toISOString(),
  }

  writeStoredUsers(updatedUsers, storage)
  writeResetTokens(tokens.filter((entry) => entry.token !== resetToken), storage)

  return {
    ok: true,
    nexusId: normalizeNexusId(updatedUsers[userIndex].nexus_id || updatedUsers[userIndex].nexusId || updatedUsers[userIndex].member_id || updatedUsers[userIndex].memberId),
  }
}
