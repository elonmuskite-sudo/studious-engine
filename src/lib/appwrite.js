import * as Appwrite from 'appwrite'
import { APPWRITE_DATABASE_ID as DEFAULT_DATABASE_ID } from './appwriteSchema.js'

const { Client, Databases, ID, Query, Realtime } = Appwrite
const TablesDB = Appwrite.TablesDB

const RUNTIME_CONFIG_KEY = 'nexus-appwrite-runtime-config'
const PUBLIC_CONFIG_KEYS = ['endpoint', 'projectId', 'databaseId']

const BUILD_DEFAULTS = {
  endpoint: import.meta.env.VITE_APPWRITE_ENDPOINT || 'https://fra.cloud.appwrite.io/v1',
  projectId: import.meta.env.VITE_APPWRITE_PROJECT_ID || '6aa473cc0035d27043b1',
  databaseId: import.meta.env.VITE_APPWRITE_DATABASE_ID || DEFAULT_DATABASE_ID,
}

function filterPublicConfig(source = {}) {
  return Object.fromEntries(PUBLIC_CONFIG_KEYS
    .filter((key) => source[key] !== undefined)
    .map((key) => [key, source[key]]))
}

function readStoredConfig() {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(RUNTIME_CONFIG_KEY)
    const stored = raw ? JSON.parse(raw) : {}
    const publicConfig = filterPublicConfig(stored)
    if (Object.keys(stored).some((key) => !PUBLIC_CONFIG_KEYS.includes(key))) {
      window.localStorage.setItem(RUNTIME_CONFIG_KEY, JSON.stringify(publicConfig))
    }
    return publicConfig
  } catch {
    return {}
  }
}

function mergeConfig(overlay = {}) {
  const stored = readStoredConfig()
  const next = { ...BUILD_DEFAULTS, ...stored, ...filterPublicConfig(overlay) }
  next.endpoint = String(next.endpoint || '').replace(/\/$/, '')
  next.databaseId = String(next.databaseId || DEFAULT_DATABASE_ID)
  return next
}

let currentConfig = mergeConfig()
export let APPWRITE_DATABASE_ID = currentConfig.databaseId
let dataUnavailable = false

export const client = new Client()
let tablesDb = null
let legacyDb = null

function normalizeList(result) {
  if (!result) return { documents: [], rows: [], total: 0 }
  const documents = result.documents || result.rows || []
  return { ...result, documents, rows: result.rows || documents, total: result.total ?? documents.length }
}

function normalizeDoc(result) {
  return result
}

async function callService(service, names, objectArgs, positionalArgs) {
  if (!service) throw new Error('Appwrite database client is not ready.')
  let lastError = null
  for (const name of names) {
    if (typeof service[name] !== 'function') continue
    try {
      return await service[name](objectArgs)
    } catch (error) {
      lastError = error
      if (error?.code >= 400 || error?.response?.status >= 400) break
      try {
        return await service[name](...positionalArgs)
      } catch (positionalError) {
        lastError = positionalError
      }
    }
  }
  if (lastError?.code === 404 || lastError?.response?.status === 404) {
    dataUnavailable = true
  }
  throw lastError || new Error(`Appwrite method ${names.join('/')} is not available.`)
}

export const databases = {
  listDocuments(databaseId, collectionId, queries) {
    if (tablesDb) {
      return callService(
        tablesDb,
        ['listRows'],
        { databaseId, tableId: collectionId, queries, total: false },
        [databaseId, collectionId, queries]
      ).then(normalizeList)
    }
    return legacyDb.listDocuments(databaseId, collectionId, queries).then(normalizeList)
  },
  getDocument(databaseId, collectionId, documentId) {
    if (tablesDb) {
      return callService(
        tablesDb,
        ['getRow'],
        { databaseId, tableId: collectionId, rowId: documentId },
        [databaseId, collectionId, documentId]
      ).then(normalizeDoc)
    }
    return legacyDb.getDocument(databaseId, collectionId, documentId)
  },
  createDocument(databaseId, collectionId, documentId, data) {
    if (tablesDb) {
      return callService(
        tablesDb,
        ['createRow'],
        { databaseId, tableId: collectionId, rowId: documentId, data },
        [databaseId, collectionId, documentId, data]
      ).then(normalizeDoc)
    }
    return legacyDb.createDocument(databaseId, collectionId, documentId, data)
  },
  updateDocument(databaseId, collectionId, documentId, data) {
    if (tablesDb) {
      return callService(
        tablesDb,
        ['updateRow'],
        { databaseId, tableId: collectionId, rowId: documentId, data },
        [databaseId, collectionId, documentId, data]
      ).then(normalizeDoc)
    }
    return legacyDb.updateDocument(databaseId, collectionId, documentId, data)
  },
  upsertDocument(databaseId, collectionId, documentId, data) {
    if (tablesDb && typeof tablesDb.upsertRow === 'function') {
      return callService(
        tablesDb,
        ['upsertRow'],
        { databaseId, tableId: collectionId, rowId: documentId, data },
        [databaseId, collectionId, documentId, data]
      ).then(normalizeDoc)
    }
    if (legacyDb && typeof legacyDb.upsertDocument === 'function') {
      return legacyDb.upsertDocument(databaseId, collectionId, documentId, data)
    }
    return databases.getDocument(databaseId, collectionId, documentId)
      .then(() => databases.updateDocument(databaseId, collectionId, documentId, data))
      .catch(() => databases.createDocument(databaseId, collectionId, documentId, data))
  },
}

export function getAppwriteConfig() {
  return { ...currentConfig }
}

export function isAppwriteConfigured() {
  return Boolean(currentConfig.endpoint && currentConfig.projectId)
}

export function isAppwriteDataAvailable() {
  return isAppwriteConfigured() && !dataUnavailable
}

export function getMissingAppwriteConfigKeys() {
  const missing = []
  if (!currentConfig.endpoint) missing.push('VITE_APPWRITE_ENDPOINT')
  if (!currentConfig.projectId) missing.push('VITE_APPWRITE_PROJECT_ID')
  if (!currentConfig.databaseId) missing.push('VITE_APPWRITE_DATABASE_ID')
  return missing
}

export function applyAppwriteConfig(overlay = {}, { persist = false } = {}) {
  currentConfig = mergeConfig(overlay)
  APPWRITE_DATABASE_ID = currentConfig.databaseId
  dataUnavailable = false

  if (persist && typeof window !== 'undefined') {
    window.localStorage.setItem(RUNTIME_CONFIG_KEY, JSON.stringify(filterPublicConfig(currentConfig)))
  }

  if (currentConfig.endpoint && currentConfig.projectId) {
    client.setEndpoint(currentConfig.endpoint).setProject(currentConfig.projectId)
    tablesDb = TablesDB ? new TablesDB(client) : null
    legacyDb = Databases ? new Databases(client) : null
  }

  return getAppwriteConfig()
}

export function clearRuntimeAppwriteConfig() {
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(RUNTIME_CONFIG_KEY)
  }
  return applyAppwriteConfig(BUILD_DEFAULTS)
}

export function isAdminRole(role) {
  return role === 'admin' || role === 'supabase_admin' || role === 'appwrite_admin'
}

applyAppwriteConfig()

export { ID, Query, Realtime }
