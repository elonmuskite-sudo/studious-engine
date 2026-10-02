import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import AuthShell from '../components/AuthShell'
import { useTheme } from '../hooks/useTheme'
import { useAuth } from '../lib/AuthContext'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
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
      await requestPasswordReset(email)
      setMessage('If an account exists for that email, a password recovery link will arrive shortly.')
      setEmail('')
    } catch (err) {
      setError(err.message || 'Failed to send reset email')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell title="Forgot your password?" subtitle="Enter your account email and we’ll send a secure password recovery link." compact>
      <div className="mx-auto w-full max-w-md">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className={`mb-2 block text-sm font-medium ${themeClasses.muted}`}>
              Email address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className={`w-full rounded-lg border px-4 py-3 text-sm outline-none transition ${themeClasses.input}`}
              placeholder="you@example.com"
            />
          </div>
          {error && <p className="text-center text-sm text-destructive">{error}</p>}
          {message && <p className="text-center text-sm text-green-500">{message}</p>}
          <button
            type="submit"
            disabled={loading}
            className={`w-full rounded-lg px-4 py-3 font-semibold transition-colors disabled:cursor-not-allowed ${themeClasses.button} disabled:bg-slate-400`}
          >
            {loading ? 'Sending...' : 'Send Reset Link'}
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
