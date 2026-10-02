import { useState } from 'react'
import { useSetting } from '../hooks/useSetting'
import SettingsShell from '../components/chat/settings/SettingsShell'
import AppearanceSettings from '../components/chat/settings/AppearanceSettings'
import NotificationsSettings from '../components/chat/settings/NotificationsSettings'
import PrivacySettings from '../components/chat/settings/PrivacySettings'
import ProfileEdit from '../components/chat/settings/ProfileEdit'
import Avatar from '../components/chat/Avatar'
import { useAuth } from '../lib/AuthContext'
import { canManageAppwriteSchema, getAppwriteConfig } from '../lib/appwrite'
import { inspectAppwriteSchema, syncAppwriteSchema, verifyAppwriteSetup } from '../lib/appwriteProvision'
import { NEXUS_COLLECTIONS } from '../lib/appwriteSchema'
import { ChevronRight, ArrowLeft, Bell, Database, Palette, ShieldCheck, UserCircle } from 'lucide-react'
import { useNavigate, useLocation } from 'react-router-dom'

function SettingsMenu() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [notificationSound] = useSetting('notificationSound', true)
  const [notificationTone] = useSetting('notificationTone', 'chime')
  const [chatWallpaper] = useSetting('chatWallpaper', 'nature')

  const sections = [
    {
      id: 'appearance',
      label: 'Appearance',
      description: 'Wallpaper, theme, visual style',
      icon: <Palette className="w-5 h-5" />,
      hint: chatWallpaper ? chatWallpaper.charAt(0).toUpperCase() + chatWallpaper.slice(1) : 'Default',
    },
    {
      id: 'notifications',
      label: 'Notifications',
      description: 'Tone selection, volume, popup sounds',
      icon: <Bell className="w-5 h-5" />,
      hint: notificationSound ? `${notificationTone.charAt(0).toUpperCase()}${notificationTone.slice(1)}` : 'Muted',
    },
    {
      id: 'privacy',
      label: 'Privacy & Security',
      description: 'End-to-end encryption, security code',
      icon: <ShieldCheck className="w-5 h-5" />,
    },
  ]

  if (user?.role === 'admin') {
    sections.push({
      id: 'database',
      label: 'Database schemas',
      description: 'Inspect and repair Appwrite tables',
      icon: <Database className="w-5 h-5" />,
      hint: 'Admin',
    })
  }

  return (
    <SettingsShell>
      <h2 className="text-2xl font-bold text-foreground mb-6">Settings</h2>

      <button
        onClick={() => navigate('/app/settings/profile')}
        className="w-full flex items-center gap-4 p-4 bg-muted/40 hover:bg-muted/75 rounded-2xl border border-border mb-6 transition duration-200"
      >
        <Avatar src={user?.avatarUrl} alt={user?.fullName || 'User'} size="lg" />
        <div className="flex-1 text-left min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <UserCircle className="w-4 h-4 text-muted-foreground" />
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Profile</p>
          </div>
          <h3 className="font-bold text-foreground text-lg leading-tight truncate">{user?.fullName || 'Anonymous User'}</h3>
          <p className="text-xs text-muted-foreground mt-1">Nexus ID: {user?.nexusIdDisplay || '10-XXXX-XXXX'}</p>
        </div>
        <ChevronRight className="w-5 h-5 text-muted-foreground flex-shrink-0" />
      </button>

      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        {sections.map((section) => (
          <button
            key={section.id}
            onClick={() => navigate(`/app/settings/${section.id}`)}
            className="w-full group border-b border-border last:border-b-0 flex items-center gap-4 p-4 hover:bg-muted/60 transition-colors text-left"
          >
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary transition">
              {section.icon}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-foreground">{section.label}</p>
              <p className="text-sm text-muted-foreground">{section.description}</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {section.hint && (
                <span className="hidden sm:inline-flex text-xs font-medium text-muted-foreground bg-muted px-2.5 py-1 rounded-full">
                  {section.hint}
                </span>
              )}
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </div>
          </button>
        ))}
      </div>
    </SettingsShell>
  )
}

function SchemaSettings() {
  const config = getAppwriteConfig()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const [verification, setVerification] = useState(null)

  const handleInspect = async () => {
    setBusy(true)
    setError('')
    try {
      setResult(await inspectAppwriteSchema(config))
      setVerification(null)
    } catch (err) {
      setError(err?.message || 'Schema inspection failed.')
    } finally {
      setBusy(false)
    }
  }

  const handleApply = async () => {
    setBusy(true)
    setError('')
    try {
      setResult(await syncAppwriteSchema(config, { apply: true, provisionAdmin: true }))
      setVerification(await verifyAppwriteSetup(config))
    } catch (err) {
      setError(err?.message || 'Schema update failed.')
    } finally {
      setBusy(false)
    }
  }

  const collections = result?.summary?.collections || NEXUS_COLLECTIONS.map((collection) => ({
    ...collection,
    missing: !result,
    attributes: collection.attributes.map((attribute) => ({ key: attribute.key, missing: !result })),
    indexes: collection.indexes.map((index) => ({ key: index.key, missing: !result })),
  }))

  return (
    <SettingsSubPage title="Database schemas">
      <div className="space-y-5">
        <div className="rounded-2xl border border-border bg-muted/30 p-4 text-sm">
          <p className="font-semibold text-foreground">Appwrite</p>
          <p className="mt-1 text-muted-foreground">The active database provider for this build.</p>
          <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
            <p>Endpoint: <span className="font-medium text-foreground">{config.endpoint || 'not set'}</span></p>
            <p>Project: <span className="font-medium text-foreground">{config.projectId || 'not set'}</span></p>
            <p>Database: <span className="font-medium text-foreground">{config.databaseId || 'not set'}</span></p>
            <p>API key: <span className="font-medium text-foreground">{config.apiKey ? 'configured' : 'missing'}</span></p>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-muted/30 p-4 text-sm">
          <p className="font-semibold text-foreground">Supabase</p>
          <p className="mt-1 text-muted-foreground">
            {import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY
              ? 'Supabase is configured and available for compatibility checks alongside Appwrite.'
              : 'No Supabase client or migration endpoint is configured in this repository, so only Appwrite-native flows are active.'}
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={handleInspect} disabled={busy || !canManageAppwriteSchema()} className="rounded-xl border border-border px-4 py-2 text-sm font-medium disabled:opacity-50">
            Inspect schema
          </button>
          <button type="button" onClick={handleApply} disabled={busy || !canManageAppwriteSchema()} className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
            {busy ? 'Updating...' : 'Apply missing schema'}
          </button>
        </div>

        {!canManageAppwriteSchema() && (
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
            Configure the Appwrite endpoint, project ID, database ID, and API key before applying changes.
          </p>
        )}
        {error && <p className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
        {result?.summary && (
          <p className="rounded-xl border border-border bg-muted p-3 text-sm text-foreground">
            Missing objects: {result.summary.missingCount}. Created this run: {result.summary.createdCount}.
          </p>
        )}

        <div className="space-y-3">
          {collections.map((collection) => (
            <div key={collection.id} className="rounded-2xl border border-border p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-semibold text-foreground">{collection.name || collection.id}</h3>
                <span className="text-xs text-muted-foreground">{collection.missing ? 'missing' : 'ready'}</span>
              </div>
              <div className="mt-3 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                {(collection.attributes || []).map((attribute) => <p key={attribute.key}>{attribute.key}: {attribute.missing ? 'missing' : 'ok'}</p>)}
                {(collection.indexes || []).map((index) => <p key={index.key}>{index.key}: {index.missing ? 'missing' : 'ok'}</p>)}
              </div>
            </div>
          ))}
        </div>

        {verification && (
          <div className="rounded-2xl border border-border p-4">
            <h3 className="font-semibold text-foreground">Verification</h3>
            <div className="mt-3 space-y-1 text-sm">
              {verification.checks.map((check) => <p key={check.name} className={check.pass ? 'text-emerald-600' : 'text-destructive'}>{check.pass ? 'Pass' : 'Fail'}: {check.name}{check.detail ? ` (${check.detail})` : ''}</p>)}
            </div>
          </div>
        )}
      </div>
    </SettingsSubPage>
  )
}

function SettingsSubPage({ title, children }) {
  const navigate = useNavigate()

  return (
    <SettingsShell>
      <button
        onClick={() => navigate('/app/settings')}
        className="flex items-center gap-2 text-primary mb-4 hover:underline"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Settings
      </button>
      <h2 className="text-2xl font-bold text-foreground mb-6">{title}</h2>
      {children}
    </SettingsShell>
  )
}

export default function SettingsPage() {
  const location = useLocation()
  const { user } = useAuth()
  const subPath = location.pathname.split('/app/settings/')[1]

  if (subPath === 'database' && user?.role === 'admin') {
    return <div className="flex-1 overflow-y-auto bg-card"><SchemaSettings /></div>
  }

  if (subPath === 'profile') {
    return (
      <div className="flex-1 overflow-y-auto bg-card">
        <SettingsSubPage title="Profile">
          <ProfileEdit />
        </SettingsSubPage>
      </div>
    )
  }

  if (subPath === 'appearance') {
    return (
      <div className="flex-1 overflow-y-auto bg-card">
        <SettingsSubPage title="Appearance">
          <AppearanceSettings />
        </SettingsSubPage>
      </div>
    )
  }

  if (subPath === 'notifications') {
    return (
      <div className="flex-1 overflow-y-auto bg-card">
        <SettingsSubPage title="Notifications">
          <NotificationsSettings />
        </SettingsSubPage>
      </div>
    )
  }

  if (subPath === 'privacy') {
    return (
      <div className="flex-1 overflow-y-auto bg-card">
        <SettingsSubPage title="Privacy & Security">
          <PrivacySettings />
        </SettingsSubPage>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto bg-card">
      <SettingsMenu />
    </div>
  )
}
