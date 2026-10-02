import { Query } from 'appwrite'
import { ADMIN_DEFAULTS, APPWRITE_DATABASE_NAME, COLLECTION_PERMISSIONS, NEXUS_COLLECTIONS } from './appwriteSchema.js'

const EXISTING_STATUSES = new Set([409, 400])

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isAlreadyExists(status, payload) {
  const type = String(payload?.type || '')
  const message = String(payload?.message || '').toLowerCase()
  return status === 409
    || (EXISTING_STATUSES.has(status) && /already exists|duplicate|conflict/.test(message))
    || type.includes('already_exists')
}

async function appwriteRequest(config, method, path, body) {
  const endpoint = String(config.endpoint || '').replace(/\/$/, '')
  const url = `${endpoint}${path.startsWith('/') ? path : `/${path}`}`
  const headers = {
    'Content-Type': 'application/json',
    'X-Appwrite-Project': config.projectId,
    'X-Appwrite-Key': config.apiKey,
  }

  const response = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  const text = await response.text()
  let payload = null
  try {
    payload = text ? JSON.parse(text) : null
  } catch {
    payload = { message: text }
  }

  return { ok: response.ok, status: response.status, payload }
}

function pushLog(logs, level, message, extra) {
  logs.push({ level, message, extra, at: new Date().toISOString() })
}

function columnKind(attribute) {
  if (attribute.type === 'boolean') return 'boolean'
  if (attribute.type === 'datetime') return 'datetime'
  if (attribute.type === 'integer') return 'integer'
  if (attribute.type === 'float') return 'float'
  if (attribute.type === 'email') return 'email'
  if ((attribute.size || 0) > 16383) return 'mediumtext'
  return 'varchar'
}

function columnBody(attribute) {
  const body = {
    key: attribute.key,
    required: Boolean(attribute.required),
    array: false,
    type: columnKind(attribute),
  }
  if (body.type === 'varchar' || attribute.type === 'string' || attribute.type === 'email') {
    body.size = attribute.size || 255
  }
  if (attribute.default !== undefined && !attribute.required) {
    body.default = attribute.default
  }
  return body
}

function listItems(payload, ...keys) {
  if (!payload) return []
  for (const key of keys) {
    if (Array.isArray(payload[key])) return payload[key]
  }
  return []
}

async function resolveDatabase(config, logs) {
  const requested = String(config.databaseId || '').trim()
  if (requested) {
    const byId = await appwriteRequest(config, 'GET', `/tablesdb/${requested}`)
    if (byId.ok) return { id: byId.payload.$id, name: byId.payload.name, created: false, missing: false }
  }

  const listed = await appwriteRequest(config, 'GET', '/tablesdb')
  const databases = listItems(listed.payload, 'databases')
  const match = databases.find((item) => (
    item.$id === requested
    || item.name === requested
    || item.name === APPWRITE_DATABASE_NAME
    || item.name === 'nexus-chat'
  ))
  if (match) {
    pushLog(logs, 'ok', `Resolved TablesDB database "${match.name}" (${match.$id})`)
    config.databaseId = match.$id
    return { id: match.$id, name: match.name, created: false, missing: false }
  }

  return { id: requested, name: APPWRITE_DATABASE_NAME, created: false, missing: true }
}

async function ensureDatabase(config, logs, { apply }) {
  const resolved = await resolveDatabase(config, logs)
  if (!resolved.missing) {
    config.databaseId = resolved.id
    pushLog(logs, 'ok', `Database "${resolved.id}" exists`)
    return { ...resolved, missing: false }
  }

  pushLog(logs, 'missing', `Database "${config.databaseId}" is missing`)
  if (!apply) return { id: config.databaseId, created: false, missing: true }

  const created = await appwriteRequest(config, 'POST', '/tablesdb', {
    databaseId: config.databaseId,
    name: APPWRITE_DATABASE_NAME,
    enabled: true,
  })
  if (!created.ok && !isAlreadyExists(created.status, created.payload)) {
    throw new Error(created.payload?.message || `Failed to create database (${created.status})`)
  }
  const id = created.payload?.$id || config.databaseId
  config.databaseId = id
  pushLog(logs, 'created', `Created database "${id}"`)
  return { id, created: true, missing: false }
}

async function waitForColumn(config, tableId, key, logs) {
  const path = `/tablesdb/${config.databaseId}/tables/${tableId}/columns/${key}`
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const result = await appwriteRequest(config, 'GET', path)
    const status = result.payload?.status
    if (result.ok && (status === 'available' || !status)) return
    if (result.ok && status === 'failed') {
      throw new Error(`Column ${tableId}.${key} failed to build`)
    }
    await sleep(350)
  }
  pushLog(logs, 'warn', `Timed out waiting for ${tableId}.${key} to become available`)
}

async function waitForIndex(config, tableId, key, logs) {
  const path = `/tablesdb/${config.databaseId}/tables/${tableId}/indexes/${key}`
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const result = await appwriteRequest(config, 'GET', path)
    const status = result.payload?.status
    if (result.ok && (status === 'available' || !status)) return
    if (result.ok && status === 'failed') {
      throw new Error(`Index ${tableId}.${key} failed to build`)
    }
    await sleep(350)
  }
  pushLog(logs, 'warn', `Timed out waiting for index ${tableId}.${key}`)
}

async function ensureTable(config, collection, logs, { apply }) {
  const path = `/tablesdb/${config.databaseId}/tables/${collection.id}`
  const existing = await appwriteRequest(config, 'GET', path)
  if (existing.ok) {
    pushLog(logs, 'ok', `Table "${collection.id}" exists`)
    return { missing: false, created: false, document: existing.payload }
  }

  if (existing.status !== 404) {
    throw new Error(existing.payload?.message || `Failed to read table ${collection.id}`)
  }

  pushLog(logs, 'missing', `Table "${collection.id}" is missing`)
  if (!apply) return { missing: true, created: false, document: null }

  const created = await appwriteRequest(config, 'POST', `/tablesdb/${config.databaseId}/tables`, {
    tableId: collection.id,
    name: collection.name,
    permissions: COLLECTION_PERMISSIONS,
    rowSecurity: false,
    enabled: true,
    columns: collection.attributes.map(columnBody),
    indexes: collection.indexes.map((index) => ({
      key: index.key,
      type: index.type,
      columns: index.attributes,
      attributes: index.attributes,
      orders: index.attributes.map(() => 'ASC'),
    })),
  })

  if (!created.ok && !isAlreadyExists(created.status, created.payload)) {
    const fallback = await appwriteRequest(config, 'POST', `/tablesdb/${config.databaseId}/tables`, {
      tableId: collection.id,
      name: collection.name,
      permissions: COLLECTION_PERMISSIONS,
      rowSecurity: false,
      enabled: true,
    })
    if (!fallback.ok && !isAlreadyExists(fallback.status, fallback.payload)) {
      throw new Error(created.payload?.message || `Failed to create table ${collection.id}`)
    }
    pushLog(logs, 'created', `Created table "${collection.id}"`)
    return { missing: false, created: true, document: fallback.payload, bundled: false }
  }

  pushLog(logs, 'created', `Created table "${collection.id}" with columns and indexes`)
  return { missing: false, created: true, document: created.payload, bundled: true }
}

async function ensureColumn(config, collection, attribute, logs, { apply }, existingKeys) {
  if (existingKeys?.has(attribute.key)) {
    pushLog(logs, 'ok', `Column ${collection.id}.${attribute.key} exists`)
    return { missing: false, created: false }
  }

  const existing = await appwriteRequest(
    config,
    'GET',
    `/tablesdb/${config.databaseId}/tables/${collection.id}/columns/${attribute.key}`
  )
  if (existing.ok) {
    pushLog(logs, 'ok', `Column ${collection.id}.${attribute.key} exists`)
    return { missing: false, created: false }
  }

  if (existing.status !== 404) {
    throw new Error(existing.payload?.message || `Failed to read ${collection.id}.${attribute.key}`)
  }

  pushLog(logs, 'missing', `Column ${collection.id}.${attribute.key} is missing`)
  if (!apply) return { missing: true, created: false }

  const kind = columnKind(attribute)
  const body = columnBody(attribute)
  const created = await appwriteRequest(
    config,
    'POST',
    `/tablesdb/${config.databaseId}/tables/${collection.id}/columns/${kind}`,
    body
  )
  if (!created.ok && !isAlreadyExists(created.status, created.payload)) {
    throw new Error(created.payload?.message || `Failed to create ${collection.id}.${attribute.key}`)
  }
  pushLog(logs, 'created', `Created column ${collection.id}.${attribute.key}`)
  await waitForColumn(config, collection.id, attribute.key, logs)
  return { missing: false, created: true }
}

async function ensureIndex(config, collection, index, logs, { apply }, existingKeys) {
  if (existingKeys?.has(index.key)) {
    pushLog(logs, 'ok', `Index ${collection.id}.${index.key} exists`)
    return { missing: false, created: false }
  }

  const path = `/tablesdb/${config.databaseId}/tables/${collection.id}/indexes/${index.key}`
  const existing = await appwriteRequest(config, 'GET', path)
  if (existing.ok) {
    pushLog(logs, 'ok', `Index ${collection.id}.${index.key} exists`)
    return { missing: false, created: false }
  }

  if (existing.status !== 404) {
    throw new Error(existing.payload?.message || `Failed to read index ${index.key}`)
  }

  pushLog(logs, 'missing', `Index ${collection.id}.${index.key} is missing`)
  if (!apply) return { missing: true, created: false }

  const body = {
    key: index.key,
    type: index.type,
    columns: index.attributes,
    attributes: index.attributes,
    orders: index.attributes.map(() => 'ASC'),
  }
  const created = await appwriteRequest(
    config,
    'POST',
    `/tablesdb/${config.databaseId}/tables/${collection.id}/indexes`,
    body
  )
  if (!created.ok && !isAlreadyExists(created.status, created.payload)) {
    throw new Error(created.payload?.message || `Failed to create index ${index.key}`)
  }
  pushLog(logs, 'created', `Created index ${collection.id}.${index.key}`)
  await waitForIndex(config, collection.id, index.key, logs)
  return { missing: false, created: true }
}

function existingKeysFrom(payload, ...lists) {
  const keys = new Set()
  for (const list of lists) {
    for (const item of listItems(payload, list)) {
      if (item?.key) keys.add(item.key)
    }
  }
  return keys
}

export async function inspectAppwriteSchema(config) {
  return syncAppwriteSchema(config, { apply: false, provisionAdmin: false })
}

export async function syncAppwriteSchema(config, options = {}) {
  const apply = Boolean(options.apply)
  const shouldProvisionAdmin = options.provisionAdmin !== false && apply
  const logs = []
  const working = { ...config }
  const summary = {
    database: null,
    collections: [],
    missingCount: 0,
    createdCount: 0,
    admin: null,
  }

  if (!working?.endpoint || !working?.projectId) {
    throw new Error('Appwrite endpoint and project ID are required.')
  }
  if (!working?.apiKey) {
    throw new Error('Appwrite API key is required to inspect or apply schema. Set it in the admin panel.')
  }
  if (!working?.databaseId) {
    throw new Error('Appwrite database ID is required.')
  }

  const database = await ensureDatabase(working, logs, { apply })
  summary.database = database
  if (database.missing) summary.missingCount += 1
  if (database.created) summary.createdCount += 1

  if (database.missing && !apply) {
    for (const collection of NEXUS_COLLECTIONS) {
      summary.collections.push({
        id: collection.id,
        name: collection.name,
        missing: true,
        attributes: collection.attributes.map((attribute) => ({ key: attribute.key, missing: true })),
        indexes: collection.indexes.map((index) => ({ key: index.key, missing: true })),
      })
      summary.missingCount += 1 + collection.attributes.length + collection.indexes.length
    }
    return { logs, summary, schema: NEXUS_COLLECTIONS, config: working }
  }

  for (const collection of NEXUS_COLLECTIONS) {
    const collectionState = {
      id: collection.id,
      name: collection.name,
      missing: false,
      attributes: [],
      indexes: [],
    }
    const ensured = await ensureTable(working, collection, logs, { apply })
    collectionState.missing = ensured.missing
    if (ensured.missing) summary.missingCount += 1
    if (ensured.created) summary.createdCount += 1

    if (ensured.missing && !apply) {
      collectionState.attributes = collection.attributes.map((attribute) => ({ key: attribute.key, missing: true }))
      collectionState.indexes = collection.indexes.map((index) => ({ key: index.key, missing: true }))
      summary.missingCount += collection.attributes.length + collection.indexes.length
      summary.collections.push(collectionState)
      continue
    }

    const columnKeys = existingKeysFrom(ensured.document, 'columns', 'attributes')
    const indexKeys = existingKeysFrom(ensured.document, 'indexes')
    const skipCreates = Boolean(ensured.bundled && apply)

    for (const attribute of collection.attributes) {
      const result = skipCreates
        ? { missing: false, created: false }
        : await ensureColumn(working, collection, attribute, logs, { apply }, columnKeys)
      collectionState.attributes.push({ key: attribute.key, type: attribute.type, missing: result.missing })
      if (result.missing) summary.missingCount += 1
      if (result.created) summary.createdCount += 1
    }

    for (const index of collection.indexes) {
      const result = skipCreates
        ? { missing: false, created: false }
        : await ensureIndex(working, collection, index, logs, { apply }, indexKeys)
      collectionState.indexes.push({ key: index.key, type: index.type, missing: result.missing })
      if (result.missing) summary.missingCount += 1
      if (result.created) summary.createdCount += 1
    }

    summary.collections.push(collectionState)
  }

  if (shouldProvisionAdmin) {
    summary.admin = await provisionAdminUser(working, logs, { apply: true })
  }

  return { logs, summary, schema: NEXUS_COLLECTIONS, config: working }
}

export async function provisionAdminUser(config, logs = [], { apply } = { apply: true }) {
  if (!config.adminEmail) throw new Error('ADMIN_EMAIL is required for admin provisioning.')

  const admin = {
    member_id: config.adminMemberId || ADMIN_DEFAULTS.memberId,
    email: config.adminEmail,
    first_name: ADMIN_DEFAULTS.firstName,
    last_name: ADMIN_DEFAULTS.lastName,
    full_name: ADMIN_DEFAULTS.fullName,
    role: ADMIN_DEFAULTS.role,
    email_verified: true,
    created_at: new Date().toISOString(),
  }

  const query = encodeURIComponent(Query.equal('member_id', admin.member_id))
  const listed = await appwriteRequest(
    config,
    'GET',
    `/tablesdb/${config.databaseId}/tables/members/rows?queries[]=${query}`
  )
  if (!listed.ok) {
    throw new Error(listed.payload?.message || 'Could not query members for admin provisioning.')
  }

  const existing = listItems(listed.payload, 'rows', 'documents')[0]
  if (existing) {
    const patch = {}
    if (existing.role !== 'admin' && existing.role !== 'appwrite_admin') patch.role = 'admin'
    if (existing.email !== admin.email) patch.email = admin.email
    if (!existing.email_verified) patch.email_verified = true
    if (Object.keys(patch).length && apply) {
      await appwriteRequest(
        config,
        'PATCH',
        `/tablesdb/${config.databaseId}/tables/members/rows/${existing.$id}`,
        { data: patch }
      )
      pushLog(logs, 'ok', `Updated existing admin (${existing.member_id})`)
    } else {
      pushLog(logs, 'ok', `Admin already exists (${existing.member_id})`)
    }
    return { created: false, record: existing }
  }

  if (!apply) {
    pushLog(logs, 'missing', `Admin member ${admin.member_id} is missing`)
    return { created: false, record: null, missing: true }
  }

  if (!config.adminPassword) throw new Error('ADMIN_PASSWORD is required to create the admin member.')

  const created = await appwriteRequest(
    config,
    'POST',
    `/tablesdb/${config.databaseId}/tables/members/rows`,
    {
      rowId: 'unique()',
      data: { ...admin, password: config.adminPassword },
      permissions: COLLECTION_PERMISSIONS,
    }
  )
  if (!created.ok && !isAlreadyExists(created.status, created.payload)) {
    throw new Error(created.payload?.message || 'Failed to provision admin member.')
  }
  pushLog(logs, 'created', `Provisioned admin member ${admin.member_id}`)
  return { created: true, record: created.payload }
}

export async function verifyAppwriteSetup(config) {
  const checks = []
  const add = (name, pass, detail) => checks.push({ name, pass, detail })
  const working = { ...config }

  const database = await resolveDatabase(working, [])
  add('database exists', !database.missing, database.name || database.id)

  if (!database.missing) {
    working.databaseId = database.id
    for (const collection of NEXUS_COLLECTIONS) {
      const result = await appwriteRequest(working, 'GET', `/tablesdb/${working.databaseId}/tables/${collection.id}`)
      add(`table ${collection.id}`, result.ok, result.payload?.name || result.payload?.message)
    }

    const query = encodeURIComponent(Query.equal('member_id', working.adminMemberId || ADMIN_DEFAULTS.memberId))
    const listed = await appwriteRequest(
      working,
      'GET',
      `/tablesdb/${working.databaseId}/tables/members/rows?queries[]=${query}`
    )
    const admin = listItems(listed.payload, 'rows', 'documents')[0]
    add('admin member exists', Boolean(admin), admin?.email || listed.payload?.message)
    add('admin role is admin', admin?.role === 'admin' || admin?.role === 'appwrite_admin', admin?.role)
    add('admin email verified', Boolean(admin?.email_verified), String(admin?.email_verified))
  }

  return {
    ok: checks.every((check) => check.pass),
    checks,
    config: working,
  }
}

export { NEXUS_COLLECTIONS }
