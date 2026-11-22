import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { toast } from 'react-hot-toast'
import { useAuthStore } from '../../store/authStore'
import { FiMail, FiLock, FiEye, FiEyeOff, FiArrowLeft } from 'react-icons/fi'

const roleLabels = {
  admin: 'Admin',
  team_manager: 'Team Manager',
  judge: 'Judge',
  scorer: 'Scorer'
}

const ForgotPassword = () => {
  const [step, setStep] = useState('email')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [reset, setReset] = useState({ token: null, email: '', role: null })
  // Set when the email is shared by several accounts
  const [accounts, setAccounts] = useState([])
  const { forgotPassword, resetPassword } = useAuthStore()
  const navigate = useNavigate()

  const emailForm = useForm()
  const passwordForm = useForm()

  // Shared by the email step and the account step, since both end up asking for a token
  const requestToken = async (email, role) => {
    const result = await forgotPassword(email, role)

    if (result.requiresAccountSelection) {
      setReset({ token: null, email: result.email, role: null })
      setAccounts(result.accounts)
      setStep('account')
      toast('This email has more than one account.', { icon: 'ℹ️' })
      return
    }

    setReset({ token: result.resetToken, email: result.email, role: result.role })
    setAccounts([])
    setStep('password')
    toast.success('Email verified. Set your new password.')
  }

  const onSubmitEmail = async (data) => {
    setLoading(true)
    try {
      await requestToken(data.email)
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not verify that email')
    } finally {
      setLoading(false)
    }
  }

  const onSelectAccount = async (role) => {
    setLoading(true)
    try {
      await requestToken(reset.email, role)
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not verify that account')
    } finally {
      setLoading(false)
    }
  }

  const backToEmail = () => {
    setReset({ token: null, email: '', role: null })
    setAccounts([])
    passwordForm.reset()
    setStep('email')
  }

  const onSubmitPassword = async (data) => {
    setLoading(true)
    try {
      await resetPassword(reset.token, data.newPassword)
      toast.success('Password reset successfully! Please sign in.')
      navigate('/login')
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to reset password')
      // An expired or already-used token can only be fixed by starting over
      if (error.response?.status === 400) backToEmail()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-center mb-2">Forgot Password</h2>
      <p className="text-center text-gray-600 text-sm mb-6">
        {step === 'email' && 'Enter the email address linked to your account.'}
        {step === 'account' && `Which account for ${reset.email}?`}
        {step === 'password' && (
          <>
            Set a new password for {reset.email}
            {reset.role && ` (${roleLabels[reset.role] || reset.role})`}
          </>
        )}
      </p>

      {step === 'account' ? (
        <div key="account-step" className="space-y-3">
          {accounts.map((account) => (
            <button
              key={account.role}
              type="button"
              disabled={loading}
              onClick={() => onSelectAccount(account.role)}
              className="w-full text-left p-4 border rounded-lg hover:border-primary-500 hover:bg-primary-50 transition-colors disabled:opacity-50"
            >
              <p className="font-medium">{roleLabels[account.role] || account.role}</p>
              <p className="text-sm text-gray-500">
                {account.full_name} · {account.username}
              </p>
            </button>
          ))}
          <button
            type="button"
            onClick={backToEmail}
            className="text-sm text-gray-600 hover:underline w-full text-center"
          >
            Use a different email
          </button>
        </div>
      ) : step === 'email' ? (
        // Distinct keys per step: without them React reuses the same <input> DOM
        // node across steps and the typed email carries over into the password field.
        <form key="email-step" onSubmit={emailForm.handleSubmit(onSubmitEmail)} className="space-y-4">
          <div>
            <label className="label">Email</label>
            <div className="relative">
              <FiMail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="email"
                {...emailForm.register('email', {
                  required: 'Email is required',
                  pattern: { value: /^\S+@\S+$/i, message: 'Invalid email address' }
                })}
                className="input pl-10"
                placeholder="Enter your email"
                autoFocus
              />
            </div>
            {emailForm.formState.errors.email && (
              <p className="text-red-500 text-sm mt-1">{emailForm.formState.errors.email.message}</p>
            )}
          </div>

          <button type="submit" disabled={loading} className="btn btn-primary w-full">
            {loading ? 'Verifying...' : 'Continue'}
          </button>
        </form>
      ) : (
        <form key="password-step" onSubmit={passwordForm.handleSubmit(onSubmitPassword)} className="space-y-4">
          <div>
            <label className="label">New Password</label>
            <div className="relative">
              <FiLock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type={showPassword ? 'text' : 'password'}
                {...passwordForm.register('newPassword', {
                  required: 'New password is required',
                  minLength: { value: 6, message: 'Password must be at least 6 characters' }
                })}
                className="input pl-10 pr-10"
                placeholder="Create a new password"
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
            {passwordForm.formState.errors.newPassword && (
              <p className="text-red-500 text-sm mt-1">{passwordForm.formState.errors.newPassword.message}</p>
            )}
          </div>

          <div>
            <label className="label">Confirm New Password</label>
            <div className="relative">
              <FiLock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type={showPassword ? 'text' : 'password'}
                {...passwordForm.register('confirmPassword', {
                  required: 'Please confirm your password',
                  validate: (value) =>
                    value === passwordForm.getValues('newPassword') || 'Passwords do not match'
                })}
                className="input pl-10"
                placeholder="Re-enter your new password"
              />
            </div>
            {passwordForm.formState.errors.confirmPassword && (
              <p className="text-red-500 text-sm mt-1">{passwordForm.formState.errors.confirmPassword.message}</p>
            )}
          </div>

          <button type="submit" disabled={loading} className="btn btn-primary w-full">
            {loading ? 'Resetting...' : 'Reset Password'}
          </button>

          <button
            type="button"
            onClick={backToEmail}
            className="text-sm text-gray-600 hover:underline w-full text-center"
          >
            Use a different email
          </button>
        </form>
      )}

      <p className="text-center mt-6 text-gray-600">
        <Link to="/login" className="text-primary-600 hover:underline font-medium inline-flex items-center gap-1">
          <FiArrowLeft /> Back to Sign In
        </Link>
      </p>
    </div>
  )
}

export default ForgotPassword
