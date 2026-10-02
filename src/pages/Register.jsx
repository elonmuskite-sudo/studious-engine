import { useMemo, useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import { useAuth } from '../lib/AuthContext'
import { useTheme } from '../hooks/useTheme'
import AuthShell from '../components/AuthShell'

export default function Register() {
  const [email, setEmail] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [password, setPassword] = useState('')
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [memberDetails, setMemberDetails] = useState(null)
  const [copied, setCopied] = useState(false)
  const { theme } = useTheme()
  const { register, user } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (user) {
      navigate('/app', { replace: true })
    }
  }, [user, navigate])

  const themeClasses = useMemo(() => theme === 'dark'
    ? {
        shell: 'border-white/10 bg-slate-950/80 text-slate-100',
        card: 'border-white/10 bg-slate-900/80 text-slate-100',
        muted: 'text-slate-300',
        input: 'border-slate-700 bg-slate-800 text-white focus:border-blue-500',
        button: 'bg-blue-600 text-white hover:bg-blue-500'
      }
    : {
        shell: 'border-slate-200 bg-white/80 text-slate-900',
        card: 'border-slate-200 bg-white/80 text-slate-900',
        muted: 'text-slate-600',
        input: 'border-slate-300 bg-white text-slate-900 focus:border-blue-500',
        button: 'bg-blue-600 text-white hover:bg-blue-500'
      }, [theme])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    setCopied(false)

    try {
      const result = await register({ email, firstName, lastName, password })
      setMemberDetails(result)
    } catch (err) {
      setError(err.message || 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  if (memberDetails) {
    const memberNumber = memberDetails.user?.nexusIdDisplay || memberDetails.user?.nexusId || memberDetails.nexusId

    return (
      <AuthShell title={memberDetails.needsEmailConfirmation ? 'Verify your email' : 'Your Nexus account is ready'} subtitle={memberDetails.needsEmailConfirmation ? 'Confirm your email using the link we sent. Your Nexus number is shown below.' : 'Your account is ready. Keep your Nexus number for your profile.'} compact>
        <div className={`flex flex-col rounded-[24px] border p-8 ${theme === 'dark' ? 'border-emerald-500/20 bg-slate-900/60' : 'border-emerald-200 bg-white/80'}`}>
          <div className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1 text-sm ${theme === 'dark' ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
            {memberDetails.needsEmailConfirmation ? 'Confirmation email sent' : 'Nexus account created'}
          </div>
          <div className={`mt-6 rounded-2xl border p-5 ${theme === 'dark' ? 'border-blue-500/20 bg-blue-500/10' : 'border-blue-200 bg-blue-50'}`}>
            <p className={`text-sm ${themeClasses.muted}`}>Nexus number</p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <p className="text-2xl font-semibold tracking-[0.25em] text-blue-500 dark:text-blue-400">{memberNumber}</p>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(memberNumber)
                    setCopied(true)
                  } catch {
                    setCopied(false)
                  }
                }}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800"
              >
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <p className={`mt-4 text-sm ${themeClasses.muted}`}>Keep this number for your Nexus profile. Sign in using your email address.</p>
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            {!memberDetails.needsEmailConfirmation && <button onClick={() => navigate('/app')} className={`rounded-xl px-4 py-3 text-sm font-semibold transition ${themeClasses.button}`}>Continue to app</button>}
            <Link to="/login" className={`rounded-xl border px-4 py-3 text-sm font-semibold transition ${theme === 'dark' ? 'border-white/10 text-slate-200 hover:bg-white/10' : 'border-slate-300 text-slate-700 hover:bg-slate-100'}`}>
              Sign in later
            </Link>
          </div>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title="Create your secure Nexus account"
      subtitle="Register with your email address. You’ll receive a Nexus number for your profile after signing up."
      compact
    >
      <div className="flex flex-col gap-8 lg:flex-row">
        <div className={`flex-1 rounded-[24px] border p-8 ${theme === 'dark' ? 'border-blue-500/20 bg-gradient-to-br from-blue-500/10 to-slate-900' : 'border-blue-200 bg-gradient-to-br from-blue-50 to-white'}`}>
          <div className={`rounded-2xl border p-4 text-sm ${theme === 'dark' ? 'border-white/10 bg-white/5 text-slate-300' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>
            • Fast onboarding<br />
            • Private Nexus number sign-in<br />
            • Syncs into the protected chat experience
          </div>
        </div>

        <div className={`w-full max-w-md rounded-[24px] border p-6 shadow-lg ${themeClasses.card}`}>
          <h2 className="text-2xl font-semibold">Register</h2>
          <p className={`mt-2 text-sm ${themeClasses.muted}`}>Your account credentials are managed securely by Supabase Auth.</p>
          <form onSubmit={handleSubmit} className="mt-6 space-y-5">
            <div>
              <label className={`mb-2 block text-sm font-medium ${themeClasses.muted}`}>Email address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className={`w-full rounded-xl border px-4 py-3 text-sm outline-none transition ${themeClasses.input}`}
                placeholder="you@example.com"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={`mb-2 block text-sm font-medium ${themeClasses.muted}`}>First name</label>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                  className={`w-full rounded-xl border px-4 py-3 text-sm outline-none transition ${themeClasses.input}`}
                  placeholder="Ava"
                />
              </div>
              <div>
                <label className={`mb-2 block text-sm font-medium ${themeClasses.muted}`}>Last name</label>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                  className={`w-full rounded-xl border px-4 py-3 text-sm outline-none transition ${themeClasses.input}`}
                  placeholder="Stone"
                />
              </div>
            </div>
            <div>
              <label className={`mb-2 block text-sm font-medium ${themeClasses.muted}`}>Password</label>
              <div className="relative">
                <input
                  type={passwordVisible ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={8}
                  required
                  autoComplete="new-password"
                  className={`w-full rounded-xl border px-4 py-3 pr-12 text-sm outline-none transition ${themeClasses.input}`}
                  placeholder="At least 8 characters"
                />
                <button
                  type="button"
                  onClick={() => setPasswordVisible((visible) => !visible)}
                  aria-label={passwordVisible ? 'Hide password' : 'Show password'}
                  aria-pressed={passwordVisible}
                  title={passwordVisible ? 'Hide password' : 'Show password'}
                  className={`absolute inset-y-0 right-0 flex w-12 items-center justify-center ${themeClasses.muted}`}
                >
                  {passwordVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            {error && <p className="text-sm text-rose-400">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className={`w-full rounded-xl px-4 py-3 text-sm font-semibold transition disabled:cursor-not-allowed ${themeClasses.button} disabled:bg-slate-600`}
            >
              {loading ? 'Creating account...' : 'Create account'}
            </button>
          </form>
          <p className="mt-6 text-center text-sm text-slate-400">
            Already a member?{' '}
            <Link to="/login" className="font-semibold text-blue-500 hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </AuthShell>
  )
}
