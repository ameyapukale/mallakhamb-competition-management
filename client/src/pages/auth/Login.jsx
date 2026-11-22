import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { toast } from 'react-hot-toast'
import { useAuthStore } from '../../store/authStore'
import { FiUser, FiLock, FiEye, FiEyeOff, FiArrowLeft, FiShield } from 'react-icons/fi'

const roleLabels = {
  admin: 'Admin',
  team_manager: 'Team Manager',
  judge: 'Judge',
  scorer: 'Scorer'
}

/**
 * Login runs as a short wizard so a username that spans several roles is never
 * ambiguous by the time a password is entered:
 *   identifier -> [role, only when there is a choice] -> password
 * Each account keeps its own password, so the password is only ever checked
 * against the one account the user has already settled on.
 */
const Login = () => {
  const [step, setStep] = useState('identifier')
  const [identifier, setIdentifier] = useState('')
  const [accounts, setAccounts] = useState([])
  const [role, setRole] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  // Server-side error for the current step, shown inline under the field
  const [error, setError] = useState('')

  const { identifyLogin, login } = useAuthStore()
  const navigate = useNavigate()

  const identifierForm = useForm()
  const passwordForm = useForm()

  // Set by the api interceptor when a stale session was cleared, so the user is
  // told why they landed back here instead of being dumped at a blank sign-in.
  useEffect(() => {
    if (sessionStorage.getItem('session-expired')) {
      sessionStorage.removeItem('session-expired')
      toast.error('Your session expired. Please sign in again.')
    }
  }, [])

  const onSubmitIdentifier = async (data) => {
    setLoading(true)
    setError('')
    try {
      const value = data.identifier.trim()
      const result = await identifyLogin(value)
      setIdentifier(value)

      if (result.requiresRoleSelection) {
        setAccounts(result.accounts)
        setRole('')
        setStep('role')
      } else {
        setAccounts([])
        setRole('')
        setStep('password')
      }
    } catch (err) {
      // An unknown login keeps the user on this screen instead of advancing
      const message = err.response?.status === 404
        ? (err.response?.data?.message || 'No account found with that username or email')
        : (err.response?.data?.message || 'Could not look up that login')
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  const onSubmitRole = (e) => {
    e.preventDefault()
    if (!role) {
      toast.error('Select which role to sign in as')
      return
    }
    setStep('password')
  }

  const onSubmitPassword = async (data) => {
    setLoading(true)
    setError('')
    try {
      await login(identifier, data.password, role || undefined)
      toast.success('Login successful!')
      navigate('/admin')
    } catch (err) {
      const message = err.response?.status === 401
        ? 'Incorrect password'
        : (err.response?.data?.message || 'Login failed')
      setError(message)
      toast.error(message)
      passwordForm.setValue('password', '')
    } finally {
      setLoading(false)
    }
  }

  const restart = () => {
    setStep('identifier')
    setAccounts([])
    setRole('')
    setError('')
    passwordForm.reset()
  }

  const subtitle = {
    identifier: 'Enter your username or email to continue.',
    role: `${identifier} has more than one account. Which one?`,
    password: role
      ? `Signing in as ${roleLabels[role] || role}`
      : `Signing in as ${identifier}`
  }[step]

  return (
    <div>
      <h2 className="text-2xl font-bold text-center mb-2">Sign In</h2>
      <p className="text-center text-gray-600 text-sm mb-6">{subtitle}</p>

      {/* Distinct keys per step: without them React reuses the same <input> DOM node
          across steps and the typed identifier carries over into the password field. */}
      {step === 'identifier' && (
        <form key="identifier-step" onSubmit={identifierForm.handleSubmit(onSubmitIdentifier)} className="space-y-4">
          <div>
            <label className="label">Username or Email</label>
            <div className="relative">
              <FiUser className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                {...identifierForm.register('identifier', { required: 'Username or email is required' })}
                className="input pl-10"
                placeholder="Enter your username or email"
                autoFocus
              />
            </div>
            {identifierForm.formState.errors.identifier && (
              <p className="text-red-500 text-sm mt-1">{identifierForm.formState.errors.identifier.message}</p>
            )}
            {error && !identifierForm.formState.errors.identifier && (
              <p className="text-red-500 text-sm mt-1">{error}</p>
            )}
          </div>

          <button type="submit" disabled={loading} className="btn btn-primary w-full">
            {loading ? 'Checking...' : 'Continue'}
          </button>
        </form>
      )}

      {step === 'role' && (
        <form key="role-step" onSubmit={onSubmitRole} className="space-y-4">
          <div>
            <label className="label">Sign in as</label>
            <div className="relative">
              <FiShield className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="input pl-10"
                autoFocus
              >
                <option value="">Select a role</option>
                {accounts.map((account) => (
                  <option key={account.role} value={account.role}>
                    {roleLabels[account.role] || account.role}
                  </option>
                ))}
              </select>
            </div>
            <p className="text-gray-500 text-xs mt-1">
              This login has {accounts.length} accounts, each with its own password.
            </p>
          </div>

          <button type="submit" disabled={!role} className="btn btn-primary w-full">
            Continue
          </button>

          <button
            type="button"
            onClick={restart}
            className="text-sm text-gray-600 hover:underline w-full text-center inline-flex items-center justify-center gap-1"
          >
            <FiArrowLeft /> Use a different login
          </button>
        </form>
      )}

      {step === 'password' && (
        <form key="password-step" onSubmit={passwordForm.handleSubmit(onSubmitPassword)} className="space-y-4">
          <div>
            <label className="label">Password</label>
            <div className="relative">
              <FiLock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type={showPassword ? 'text' : 'password'}
                {...passwordForm.register('password', { required: 'Password is required' })}
                className="input pl-10 pr-10"
                placeholder="Enter your password"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400"
              >
                {showPassword ? <FiEyeOff /> : <FiEye />}
              </button>
            </div>
            {passwordForm.formState.errors.password && (
              <p className="text-red-500 text-sm mt-1">{passwordForm.formState.errors.password.message}</p>
            )}
            {error && !passwordForm.formState.errors.password && (
              <p className="text-red-500 text-sm mt-1">{error}</p>
            )}
          </div>

          <button type="submit" disabled={loading} className="btn btn-primary w-full">
            {loading ? 'Signing in...' : 'Sign In'}
          </button>

          <button
            type="button"
            onClick={accounts.length > 1 ? () => setStep('role') : restart}
            className="text-sm text-gray-600 hover:underline w-full text-center inline-flex items-center justify-center gap-1"
          >
            <FiArrowLeft /> {accounts.length > 1 ? 'Change role' : 'Use a different login'}
          </button>
        </form>
      )}

      <p className="text-center mt-6 text-gray-600">
        Registering a team?{' '}
        <Link to="/" className="text-primary-600 hover:underline font-medium">
          Go to the home page
        </Link>
      </p>
    </div>
  )
}

export default Login
