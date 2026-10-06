#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const REQUIRED_KEYS = [
  'VITE_APPWRITE_ENDPOINT',
  'VITE_APPWRITE_PROJECT_ID',
  'VITE_APPWRITE_DATABASE_ID',
  'APPWRITE_API_KEY',
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'RESEND_API_KEY',
  'ADMIN_EMAIL',
  'ADMIN_PASSWORD',
  'ADMIN_MEMBER_ID',
]

const PLACEHOLDER_HINTS = [
  'your_',
  'example.com',
  'replace-me',
  'changeme',
  'your-appwrite',
  'your-project',
  'your_supabase',
  'your_domain',
]

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {}

  const values = {}
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx === -1) continue
    const key = trimmed.slice(0, idx).trim()
    let value = trimmed.slice(idx + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    values[key] = value
  }
  return values
}

function getEnvValue(key) {
  const localValues = readEnvFile(path.join(rootDir, '.env'))
  const productionValues = readEnvFile(path.join(rootDir, '.env.production'))
  return process.env[key] ?? productionValues[key] ?? localValues[key] ?? ''
}

function isPlaceholder(value) {
  const text = String(value || '').trim().toLowerCase()
  if (!text) return true
  return PLACEHOLDER_HINTS.some((hint) => text.includes(hint))
}

async function main() {
  const values = Object.fromEntries(REQUIRED_KEYS.map((key) => [key, getEnvValue(key)]))
  const isStrictDeploy = Boolean(process.env.VERCEL || process.env.VERCEL_ENV || process.env.NODE_ENV === 'production')

  const missing = REQUIRED_KEYS.filter((key) => {
    const value = values[key]
    return !String(value || '').trim() || isPlaceholder(value)
  })

  if (isStrictDeploy && missing.length) {
    console.error('[env:validate] Missing or placeholder production env values before deploy:')
    for (const key of missing) {
      console.error(` - ${key}`)
    }
    process.exit(1)
  }

  if (!isStrictDeploy) {
    console.log('[env:validate] Local build detected; environment validation passed with local defaults if present.')
  } else {
    console.log('[env:validate] Production env validation passed.')
  }

}

main().catch((error) => {
  console.error('[env:validate] Failed:', error.message)
  process.exit(1)
})
