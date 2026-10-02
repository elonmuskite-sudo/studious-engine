import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import AuthShell from '../components/AuthShell'
import { useTheme } from '../hooks/useTheme'
import { useAuth } from '../lib/AuthContext'

export default function ForgotPassword() {
  const [identifier, setIdentifier] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { theme } = useTheme()
  const { requestPasswordReset } = useAuth()

  const themeClasses = useMemo(() => theme === 'dark'
    ? {
        muted: 'text-slate-300',
        input: 'border-slate-700 bg-slate-800 text-white focus:border-primary focus:ring-primary',
        button: 'bg-primary text-white hover:bg-primary/90'
      }
    : {
        muted: 'text-slate-600',
        input: 'border-slate-300 bg-white text-slate-900 focus:border-primary focus:ring-primary',
        button: 'bg-primary text-white hover:bg-primary/90'
      }, [theme])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setMessage('')
    setLoading(true)

    try {
      const result = await requestPasswordReset(identifier)
      if (!result.ok) {
        throw new Error(result.message || 'No account found for that number.')
      }

      const resetLink = result.resetUrl || `/reset-password?token=${encodeURIComponent(result.token)}`
      const origin = typeof window !== 'undefined' ? window.location.origin : ''
      const fullLink = `${origin}${resetLink}`
      setMessage(`Reset link ready. Open ${fullLink} to choose a new password.`)
      setIdentifier('')
    } catch (err) {
      setError(err.message || 'Failed to send reset email')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell title="Forgot your password?" subtitle="Enter your Nexus number or account email to generate a reset link for your account." compact>
      <div className="mx-auto w-full max-w-md">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className={`mb-2 block text-sm font-medium ${themeClasses.muted}`}>
              Nexus number or email
            </label>
            <input
              type="text"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              required
              className={`w-full rounded-lg border px-4 py-3 text-sm outline-none transition ${themeClasses.input}`}
              placeholder="10-1234-5678 or you@example.com"
            />
          </div>
          {error && <p className="text-center text-sm text-destructive">{error}</p>}
          {message && <p className="text-center text-sm text-green-500">{message}</p>}
          <button
            type="submit"
            disabled={loading}
            className={`w-full rounded-lg px-4 py-3 font-semibold transition-colors disabled:cursor-not-allowed ${themeClasses.button} disabled:bg-slate-400`}
          >
            {loading ? 'Preparing...' : 'Send Reset Link'}
          </button>
        </form>
        <p className={`mt-6 text-center text-sm ${themeClasses.muted}`}>
            Remember your password?{' '}
            <Link to="/login" className="font-medium text-primary hover:underline">
              Log in
            </Link>
          </p>
      </div>
    </AuthShell>
  )
}
