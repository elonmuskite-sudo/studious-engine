import { client, databases, isAppwriteDataAvailable, APPWRITE_DATABASE_ID, ID, Query, Realtime } from './appwrite'
import { findMemberByNexusId, supabase } from './supabase'
import { sendAppwriteMessage } from './appwriteChat'

const STORAGE_KEY = 'nexus-chat-state-v1'
const CONTACTS_STORAGE_KEY = 'nexus-contacts-state-v1'
const APPWRITE_ID_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,35}$/

function readLocalContacts() {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(CONTACTS_STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function writeLocalContacts(contacts) {
  if (typeof window === 'undefined') return contacts

  try {
    window.localStorage.setItem(CONTACTS_STORAGE_KEY, JSON.stringify(contacts))
  } catch {
    // Keep the in-memory contact list usable when browser storage is unavailable.
  }

  return contacts
}

function notifyContactsUpdate() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('nexus-contacts:updated'))
  }
}

function notifyChange() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('nexus-chat:updated'))
  }
}

function readLocalChats() {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function writeLocalChats(chats) {
  if (typeof window === 'undefined') return chats

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(chats))
  } catch {
    // Keep the in-memory conversation list usable when browser storage is unavailable.
  }

  return chats
}

function notifyChatUpdate() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('nexus-chat:updated'))
  }
}

function isAppwriteId(str) {
  return APPWRITE_ID_REGEX.test(String(str || ''))
}

async function upsertChatDocument(chat) {
  const payload = {
    title: chat.title,
    type: chat.type || 'private',
    owner_id: chat.owner_id || null,
    created_at: chat.created_at || new Date().toISOString(),
  }
  const id = String(chat.id)

  if (typeof databases.upsertDocument === 'function') {
    return databases.upsertDocument(APPWRITE_DATABASE_ID, 'chats', id, payload)
  }

  try {
    await databases.getDocument(APPWRITE_DATABASE_ID, 'chats', id)
    return databases.updateDocument(APPWRITE_DATABASE_ID, 'chats', id, payload)
  } catch {
    return databases.createDocument(APPWRITE_DATABASE_ID, 'chats', id, payload)
  }
}

async function ensureChatMembership(chatId, profileId) {
  if (!profileId) throw new Error('Both chat participants must be signed in users.')
  const { documents } = await databases.listDocuments(APPWRITE_DATABASE_ID, 'chat_members', [
    Query.equal('chat_id', String(chatId)),
    Query.equal('profile_id', String(profileId)),
    Query.limit(1),
  ])
  if (documents?.length) return documents[0]

  return databases.createDocument(APPWRITE_DATABASE_ID, 'chat_members', ID.unique(), {
    chat_id: String(chatId),
    profile_id: String(profileId),
    joined_at: new Date().toISOString(),
  })
}

export function startRealtimeListeners() {
  if (!client || !isAppwriteDataAvailable()) return null

  const realtime = new Realtime(client)
  let closed = false
  let subscription = null
  let currentUserId = null
  supabase?.auth.getSession().then(({ data }) => {
    const userId = data?.session?.user?.id
    if (userId) currentUserId = String(userId)
  }).catch(() => {})

  realtime.subscribe(
    [
      `databases.${APPWRITE_DATABASE_ID}.collections.messages.documents`,
      `databases.${APPWRITE_DATABASE_ID}.collections.chats.documents`,
      `databases.${APPWRITE_DATABASE_ID}.tables.messages.rows`,
      `databases.${APPWRITE_DATABASE_ID}.tables.chats.rows`,
      `databases.${APPWRITE_DATABASE_ID}.tables.chat_members.rows`,
    ],
    async (event) => {
      const payload = event?.payload
      const events = event?.events || []
      const isMessage = events.some((name) => name.includes('messages'))
      const isChat = events.some((name) => name.includes('.chats.') || name.includes('tables.chats') || name.includes('chat_members'))

      if (isMessage && payload?.chat_id) {
        await appendMessage(String(payload.chat_id), {
          id: String(payload.$id || payload.id),
          sender_id: String(payload.sender_id || 'other'),
          content: payload.content,
          type: payload.type || 'text',
          file_url: payload.file_url || null,
          file_name: payload.file_name || null,
          encrypted: Boolean(payload.encrypted),
          created_at: payload.created_at || payload.$createdAt || new Date().toISOString(),
        })

        if (typeof window !== 'undefined' && String(payload.sender_id || '') !== currentUserId) {
          window.dispatchEvent(new CustomEvent('nexus:incoming-notification', {
            detail: {
              title: 'New message',
              preview: payload.type === 'text' ? payload.content : 'New attachment received',
              avatarUrl: '/logo.png',
              type: 'message',
            },
          }))
        }
      }

      if (isChat) {
        await readChats()
        notifyChatUpdate()
      }
    }
  ).then((sub) => {
    if (closed) {
      sub.close()
      return
    }
    subscription = sub
  }).catch(() => {})

  return () => {
    closed = true
    if (subscription && typeof subscription.close === 'function') {
      subscription.close()
    }
  }
}

export function stopRealtimeListeners(unsubscribe) {
  if (typeof unsubscribe === 'function') {
    unsubscribe()
  }
  if (unsubscribe && typeof unsubscribe.close === 'function') {
    unsubscribe.close()
  }
}

export async function readChats(userId) {
  let remoteChats = []
  let memberChatIds = null
  let membersByChat = new Map()
  if (databases && isAppwriteDataAvailable()) {
    try {
      if (userId) {
        const { documents: memberships } = await databases.listDocuments(APPWRITE_DATABASE_ID, 'chat_members', [Query.limit(500)])
        for (const membership of memberships || []) {
          const chatId = String(membership.chat_id)
          const profileId = String(membership.profile_id)
          if (!membersByChat.has(chatId)) membersByChat.set(chatId, new Set())
          membersByChat.get(chatId).add(profileId)
        }
        memberChatIds = new Set(
          [...membersByChat.entries()]
            .filter(([, profileIds]) => profileIds.has(String(userId)))
            .map(([chatId]) => chatId)
        )
      }
      const { documents } = await databases.listDocuments(APPWRITE_DATABASE_ID, 'chats', [
        Query.orderDesc('created_at'),
        Query.limit(500),
      ])
      remoteChats = (documents || []).map((chat) => {
        const id = String(chat.$id || chat.id)
        return {
          ...chat,
          id,
          participant_ids: [...(membersByChat?.get(id) || [])],
          messages: [],
        }
      })
      if (memberChatIds) {
        remoteChats = remoteChats.filter((chat) => memberChatIds.has(chat.id) || String(chat.owner_id || '') === String(userId))
      }
    } catch {
      if (userId) memberChatIds = new Set()
    }
  }

  const localChats = readLocalChats()
  const mergedMap = new Map()

  localChats.forEach((chat) => {
    mergedMap.set(chat.id, chat)
  })

  remoteChats.forEach((chat) => {
    const existing = mergedMap.get(chat.id)
    mergedMap.set(chat.id, {
      ...existing,
      ...chat,
      messages: existing?.messages || chat.messages || [],
    })
  })

  const merged = Array.from(mergedMap.values())
  if (!userId) return merged
  return merged.filter((chat) => (
    memberChatIds?.has(String(chat.id))
    || String(chat.owner_id || '') === String(userId)
    || (Array.isArray(chat.participant_ids) && chat.participant_ids.map(String).includes(String(userId)))
  ))
}

export async function writeChats(chats) {
  const localChats = writeLocalChats(chats)

  if (databases && isAppwriteDataAvailable()) {
    try {
      const chatsToUpsert = localChats.filter((chat) => isAppwriteId(chat.id))
      await Promise.all(chatsToUpsert.map((chat) => upsertChatDocument(chat)))
    } catch {
      // Local state remains available; explicit message sends report remote delivery errors separately.
    }
  }

  notifyChange()
  return localChats
}

export async function getChats(userId) {
  return readChats(userId)
}

export async function sendChatMessage(chatId, message) {
  if (!isAppwriteDataAvailable()) {
    throw new Error('The chat service is unavailable. The message was not sent.')
  }
  await sendAppwriteMessage(chatId, message)
  await appendMessage(chatId, message)
  return message
}

export async function appendMessage(chatId, message) {
  const chats = await getChats()
  const chat = chats.find(item => item.id === chatId)

  if (!chat) return null

  const nextMessage = {
    id: message.id || `${Date.now()}`,
    sender_id: message.sender_id || 'me',
    content: message.content || '',
    type: message.type || 'text',
    encrypted: Boolean(message.encrypted),
    file_url: message.file_url || null,
    file_name: message.file_name || null,
    duration: message.duration || null,
    created_at: message.created_at || new Date().toISOString(),
  }

  const existingMessages = Array.isArray(chat.messages) ? chat.messages : []
  if (existingMessages.some((m) => m.id === nextMessage.id)) {
    return chat
  }

  const updatedChat = {
    ...chat,
    messages: [...existingMessages, nextMessage],
    last_message: nextMessage.content,
    last_message_time: nextMessage.created_at,
    unread_count: 0,
  }

  const updatedChats = chats.map(item => (item.id === chatId ? updatedChat : item))
  await writeChats(updatedChats)
  return updatedChat
}

export async function getChatById(chatId, userId) {
  if (databases && isAppwriteDataAvailable()) {
    try {
      if (userId) {
        const { documents: memberships } = await databases.listDocuments(APPWRITE_DATABASE_ID, 'chat_members', [
          Query.equal('chat_id', String(chatId)),
          Query.equal('profile_id', String(userId)),
          Query.limit(1),
        ])
        if (!memberships?.length) return null
      }
      const chatData = await databases.getDocument(APPWRITE_DATABASE_ID, 'chats', chatId)
      const { documents } = await databases.listDocuments(APPWRITE_DATABASE_ID, 'messages', [
        Query.equal('chat_id', String(chatId)),
        Query.orderAsc('created_at'),
      ])

      return {
        ...chatData,
        id: String(chatData.$id || chatData.id),
        messages: (documents || []).map((msg) => ({
          ...msg,
          id: String(msg.$id || msg.id),
        })),
      }
    } catch {
      // Fall back to locally cached chats when the remote chat or messages table cannot be read.
    }
  }

  const chats = await getChats(userId)
  return chats.find(chat => chat.id === chatId) || null
}

export async function createChat(chatData) {
  const participantIds = [...new Set((chatData.participantIds || []).map((id) => String(id)).filter(Boolean))]
  if (participantIds.length && !isAppwriteDataAvailable()) {
    throw new Error('Recipient delivery is unavailable because the chat database is not connected.')
  }

  const newChat = {
    id: isAppwriteDataAvailable() ? ID.unique() : `${Date.now()}`,
    title: chatData.title || 'New Chat',
    type: chatData.type || 'private',
    avatar_url: chatData.avatar_url || null,
    last_message: chatData.last_message || 'New conversation',
    last_message_time: new Date().toISOString(),
    unread_count: 0,
    encrypted: Boolean(chatData.encrypted),
    owner_id: chatData.owner_id ? String(chatData.owner_id) : null,
    participant_ids: participantIds,
    messages: chatData.messages || [],
    created_at: new Date().toISOString(),
  }

  if (isAppwriteDataAvailable()) {
    await upsertChatDocument(newChat)
    await Promise.all(participantIds.map((profileId) => ensureChatMembership(newChat.id, profileId)))
  }

  const chats = readLocalChats().filter((chat) => chat.id !== newChat.id)
  writeLocalChats([newChat, ...chats])
  notifyChange()
  return newChat
}

export async function getContacts() {
  return readLocalContacts()
}

export async function addContact(contactData) {
  const contacts = await getContacts()
  const newContact = {
    id: `${Date.now()}`,
    name: contactData.name,
    nexusId: contactData.nexusId,
    avatarUrl: contactData.avatarUrl || null,
    createdAt: new Date().toISOString(),
  }
  const updatedContacts = [newContact, ...contacts]
  await writeLocalContacts(updatedContacts)
  notifyContactsUpdate()
  return newContact
}

export async function deleteContact(contactId) {
  const contacts = await getContacts()
  const updatedContacts = contacts.filter(c => c.id !== contactId)
  await writeLocalContacts(updatedContacts)
  notifyContactsUpdate()
  return updatedContacts
}

export function formatNexusId(raw) {
  const digits = raw.replace(/\D/g, '')
  if (digits.length >= 10) {
    return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6, 10)}`
  }
  return raw
}

export async function searchUserByNexusId(nexusId) {
  const normalizedId = String(nexusId || '').replace(/\D/g, '')
  if (!/^10\d{8}$/.test(normalizedId)) return null
  return findMemberByNexusId(normalizedId)
}
