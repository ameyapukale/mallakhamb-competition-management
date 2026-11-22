import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import { FiArrowLeft, FiCheckCircle, FiUserPlus, FiUsers } from 'react-icons/fi'

const RegisterJudge = () => {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()

  const [competitionId, setCompetitionId] = useState(searchParams.get('competition') || '')
  const [selectedJudgeId, setSelectedJudgeId] = useState('')
  const [mode, setMode] = useState('existing')

  const newJudgeForm = useForm({ defaultValues: { role: 'judge' } })

  const { data: competitions } = useQuery({
    queryKey: ['admin-active-competitions'],
    queryFn: async () => {
      const res = await api.get('/competitions/judge/active')
      return res.data.data
    }
  })

  useEffect(() => {
    if (!competitionId && competitions?.length) setCompetitionId(String(competitions[0].id))
  }, [competitions, competitionId])

  // Every judge/scorer account, flagged with whether they are already registered
  const { data: eligible, isLoading: loadingEligible } = useQuery({
    queryKey: ['eligible-judges', competitionId],
    queryFn: async () => {
      const res = await api.get(`/competitions/${competitionId}/eligible-judges`)
      return res.data.data
    },
    enabled: !!competitionId
  })

  const available = eligible?.filter((j) => !j.is_registered) || []
  const alreadyRegistered = eligible?.filter((j) => j.is_registered) || []

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['eligible-judges'] })
    queryClient.invalidateQueries({ queryKey: ['competition-judges'] })
    queryClient.invalidateQueries({ queryKey: ['admin-active-competitions'] })
    queryClient.invalidateQueries({ queryKey: ['panel-form-data'] })
  }

  const registerExisting = useMutation({
    mutationFn: (judgeId) => api.post(`/competitions/${competitionId}/judges`, { judge_id: judgeId }),
    onSuccess: (res) => {
      toast.success(res.data.message)
      setSelectedJudgeId('')
      refresh()
    },
    onError: (error) => toast.error(error.response?.data?.message || 'Failed to register judge')
  })

  // Creating an account and registering it are two calls; if the second fails the
  // account still exists and shows up in the dropdown above.
  const createAndRegister = useMutation({
    mutationFn: async (form) => {
      const created = await api.post('/auth/register', {
        username: form.username,
        email: form.email,
        password: form.password,
        full_name: form.full_name,
        role: form.role,
        phone: form.phone || undefined
      })
      const newId = created.data.data.userId
      await api.post(`/competitions/${competitionId}/judges`, { judge_id: newId })
      return form.full_name
    },
    onSuccess: (fullName) => {
      toast.success(`${fullName} created and registered`)
      newJudgeForm.reset({ role: 'judge' })
      setMode('existing')
      refresh()
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || 'Failed to create judge')
    }
  })

  const selectedCompetition = competitions?.find((c) => String(c.id) === String(competitionId))

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/admin/registered-judges')} className="p-2 rounded-lg hover:bg-gray-100">
          <FiArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold">Register Judge</h1>
          <p className="text-gray-500">Register a judge for a competition on their behalf</p>
        </div>
      </div>

      <div className="card">
        <label className="label">Competition</label>
        <select
          value={competitionId}
          onChange={(e) => { setCompetitionId(e.target.value); setSelectedJudgeId('') }}
          className="input max-w-xl"
        >
          <option value="">Select a competition</option>
          {competitions?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.competition_name} — {c.registered_judges} registered
            </option>
          ))}
        </select>
      </div>

      {!competitionId ? (
        <div className="card text-center py-12">
          <FiUsers className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">Select a competition to register judges for it.</p>
        </div>
      ) : (
        <>
          {/* Mode switch */}
          <div className="flex gap-2">
            <button
              onClick={() => setMode('existing')}
              className={`btn text-sm ${mode === 'existing' ? 'btn-primary' : 'btn-outline'}`}
            >
              Existing account
            </button>
            <button
              onClick={() => setMode('new')}
              className={`btn text-sm ${mode === 'new' ? 'btn-primary' : 'btn-outline'}`}
            >
              New judge account
            </button>
          </div>

          {mode === 'existing' ? (
            <div className="card space-y-4">
              <h2 className="text-lg font-semibold">Register an existing judge</h2>

              {loadingEligible ? (
                <div className="flex justify-center py-6"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600"></div></div>
              ) : available.length === 0 ? (
                <div className="text-sm text-amber-700 bg-amber-50 rounded-lg p-3">
                  Every judge account is already registered for
                  {selectedCompetition ? ` ${selectedCompetition.competition_name}` : ' this competition'}.
                  Use <button onClick={() => setMode('new')} className="underline font-medium">New judge account</button> to add someone else.
                </div>
              ) : (
                <>
                  <div>
                    <label className="label">Judge</label>
                    <select
                      value={selectedJudgeId}
                      onChange={(e) => setSelectedJudgeId(e.target.value)}
                      className="input"
                    >
                      <option value="">Select a person</option>
                      {available.map((j) => (
                        <option key={j.id} value={j.id}>
                          {j.full_name} — {j.username} ({j.role})
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    onClick={() => registerExisting.mutate(parseInt(selectedJudgeId, 10))}
                    disabled={!selectedJudgeId || registerExisting.isPending}
                    className="btn btn-primary"
                  >
                    {registerExisting.isPending ? 'Registering...' : 'Register for Competition'}
                  </button>
                </>
              )}

              {alreadyRegistered.length > 0 && (
                <div className="pt-4 border-t">
                  <p className="text-sm font-medium text-gray-500 mb-2">
                    Already registered ({alreadyRegistered.length})
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {alreadyRegistered.map((j) => (
                      <span key={j.id} className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full bg-green-50 text-green-700">
                        <FiCheckCircle className="w-3 h-3" /> {j.full_name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <form
              onSubmit={newJudgeForm.handleSubmit((form) => createAndRegister.mutate(form))}
              className="card space-y-4"
            >
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <FiUserPlus className="w-5 h-5" /> Create a new judge account
              </h2>
              <p className="text-sm text-gray-500">
                Creates the account and registers it for this competition in one step.
                Share the username and password with the judge so they can sign in.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="label">Full Name</label>
                  <input
                    className="input"
                    placeholder="e.g. Ravi Kulkarni"
                    {...newJudgeForm.register('full_name', { required: 'Full name is required' })}
                  />
                  {newJudgeForm.formState.errors.full_name && (
                    <p className="text-red-500 text-sm mt-1">{newJudgeForm.formState.errors.full_name.message}</p>
                  )}
                </div>

                <div>
                  <label className="label">Role</label>
                  <select className="input" {...newJudgeForm.register('role', { required: true })}>
                    <option value="judge">Judge</option>
                  </select>
                </div>

                <div>
                  <label className="label">Username</label>
                  <input
                    className="input"
                    placeholder="at least 3 characters"
                    {...newJudgeForm.register('username', {
                      required: 'Username is required',
                      minLength: { value: 3, message: 'At least 3 characters' }
                    })}
                  />
                  {newJudgeForm.formState.errors.username && (
                    <p className="text-red-500 text-sm mt-1">{newJudgeForm.formState.errors.username.message}</p>
                  )}
                </div>

                <div>
                  <label className="label">Email</label>
                  <input
                    type="email"
                    className="input"
                    placeholder="judge@example.com"
                    {...newJudgeForm.register('email', {
                      required: 'Email is required',
                      pattern: { value: /^\S+@\S+$/i, message: 'Invalid email address' }
                    })}
                  />
                  {newJudgeForm.formState.errors.email && (
                    <p className="text-red-500 text-sm mt-1">{newJudgeForm.formState.errors.email.message}</p>
                  )}
                </div>

                <div>
                  <label className="label">Phone (optional)</label>
                  <input className="input" {...newJudgeForm.register('phone')} />
                </div>

                <div>
                  <label className="label">Password</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="at least 6 characters"
                    {...newJudgeForm.register('password', {
                      required: 'Password is required',
                      minLength: { value: 6, message: 'At least 6 characters' }
                    })}
                  />
                  {newJudgeForm.formState.errors.password && (
                    <p className="text-red-500 text-sm mt-1">{newJudgeForm.formState.errors.password.message}</p>
                  )}
                </div>
              </div>

              <button type="submit" disabled={createAndRegister.isPending} className="btn btn-primary">
                {createAndRegister.isPending ? 'Creating...' : 'Create and Register'}
              </button>
            </form>
          )}
        </>
      )}
    </div>
  )
}

export default RegisterJudge
