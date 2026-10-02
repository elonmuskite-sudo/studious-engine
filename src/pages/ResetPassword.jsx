import { useState, useMemo } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import AuthShell from '../components/AuthShell'
import { useTheme } from '../hooks/useTheme'
import { useAuth } from '../lib/AuthContext'

export default function ResetPassword() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const { theme } = useTheme()
  const { resetPassword } = useAuth()

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

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    const token = new URLSearchParams(location.search).get('token')
    if (!token) {
      setError('This reset link is missing a token. Please request a new reset link.')
      return
    }

    setLoading(true)

    try {
      const result = await resetPassword(token, password)
      if (!result.ok) {
        throw new Error('Password reset failed.')
      }
      navigate('/login', { replace: true })
    } catch (err) {
      setError(err.message || 'Failed to reset password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell title="Reset your password" subtitle="Choose a new password for your Nexus account and continue securely." compact>
      <div className="mx-auto w-full max-w-md">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className={`mb-2 block text-sm font-medium ${themeClasses.muted}`}>
              New Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className={`w-full rounded-lg border px-4 py-3 text-sm outline-none transition ${themeClasses.input}`}
              placeholder="••••••••"
            />
          </div>
          <div>
            <label className={`mb-2 block text-sm font-medium ${themeClasses.muted}`}>
              Confirm New Password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              className={`w-full rounded-lg border px-4 py-3 text-sm outline-none transition ${themeClasses.input}`}
              placeholder="••••••••"
            />
          </div>
          {error && <p className="text-center text-sm text-destructive">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className={`w-full rounded-lg px-4 py-3 font-semibold transition-colors disabled:cursor-not-allowed ${themeClasses.button} disabled:bg-slate-400`}
          >
            {loading ? 'Resetting...' : 'Reset Password'}
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
