#!/usr/bin/env node
/**
 * Nexus Chat Appwrite schema setup
 *
 *   node scripts/setup-appwrite.js [--dry-run] [--verify-only]
 *
 * Env:
 *   VITE_APPWRITE_ENDPOINT / APPWRITE_ENDPOINT
 *   VITE_APPWRITE_PROJECT_ID / APPWRITE_PROJECT_ID
 *   VITE_APPWRITE_DATABASE_ID / APPWRITE_DATABASE_ID
 *   APPWRITE_API_KEY (server-only)
 *   ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_MEMBER_ID
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { inspectAppwriteSchema, syncAppwriteSchema, verifyAppwriteSetup } from '../src/lib/appwriteProvision.js'
import { ADMIN_DEFAULTS } from '../src/lib/appwriteSchema.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return
  const text = fs.readFileSync(filePath, 'utf8')
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx === -1) continue
    const key = trimmed.slice(0, idx).trim()
    let value = trimmed.slice(idx + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = value
  }
}

parseEnvFile(path.join(root, '.env'))
parseEnvFile(path.join(root, '.env.local'))

function env(...keys) {
  for (const key of keys) {
    if (process.env[key]) return process.env[key]
  }
  return ''
}

const args = new Set(process.argv.slice(2))
const dryRun = args.has('--dry-run')
const verifyOnly = args.has('--verify-only')

const config = {
  endpoint: env('APPWRITE_ENDPOINT', 'VITE_APPWRITE_ENDPOINT'),
  projectId: env('APPWRITE_PROJECT_ID', 'VITE_APPWRITE_PROJECT_ID'),
  databaseId: env('APPWRITE_DATABASE_ID', 'VITE_APPWRITE_DATABASE_ID') || '6aafb57c002d1184ead1',
  apiKey: env('APPWRITE_API_KEY'),
  adminEmail: env('ADMIN_EMAIL'),
  adminPassword: env('ADMIN_PASSWORD'),
  adminMemberId: env('ADMIN_MEMBER_ID') || ADMIN_DEFAULTS.memberId,
}

if (!config.endpoint || !config.projectId || !config.apiKey) {
  console.error('[setup-appwrite] Missing APPWRITE endpoint, project ID, or API key.')
  process.exit(1)
}

if (!dryRun && !verifyOnly && (!config.adminEmail || !config.adminPassword)) {
  console.error('[setup-appwrite] ADMIN_EMAIL and ADMIN_PASSWORD are required for admin provisioning.')
  process.exit(1)
}

try {
  if (verifyOnly) {
    const result = await verifyAppwriteSetup(config)
    for (const check of result.checks) {
      console.log(`${check.pass ? 'PASS' : 'FAIL'}  ${check.name}${check.detail ? ` (${check.detail})` : ''}`)
    }
    process.exit(result.ok ? 0 : 4)
  }

  const result = dryRun
    ? await inspectAppwriteSchema(config)
    : await syncAppwriteSchema(config, { apply: true, provisionAdmin: true })

  for (const log of result.logs) {
    console.log(`[${log.level}] ${log.message}`)
  }

  if (!dryRun) {
    const verified = await verifyAppwriteSetup(config)
    for (const check of verified.checks) {
      console.log(`${check.pass ? 'PASS' : 'FAIL'}  ${check.name}${check.detail ? ` (${check.detail})` : ''}`)
    }
    if (!verified.ok) process.exit(4)
  }

  console.log('[done] setup-appwrite.js finished with exit 0')
} catch (error) {
  console.error('[setup-appwrite] failed:', error.message)
  process.exit(2)
}
