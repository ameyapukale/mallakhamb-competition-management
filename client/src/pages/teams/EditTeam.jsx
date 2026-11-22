import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import { useAuthStore } from '../../store/authStore'
import { FiArrowLeft, FiInfo } from 'react-icons/fi'

const EditTeam = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const isAdmin = user?.role === 'admin'
  const { register, handleSubmit, reset, formState: { errors } } = useForm()

  const { data: team, isLoading } = useQuery({
    queryKey: ['team', id],
    queryFn: async () => {
      const res = await api.get(`/teams/${id}`)
      return res.data.data
    }
  })

  // Passing team_id keeps this team's own manager in the list — without it the
  // current manager would look "taken" by the very team being edited.
  const { data: managers } = useQuery({
    queryKey: ['available-team-managers', id],
    queryFn: async () => {
      const res = await api.get('/users/team-managers/available', { params: { team_id: id } })
      return res.data.data
    },
    enabled: isAdmin
  })

  const available = managers?.available || []
  const assigned = managers?.assigned || []

  useEffect(() => {
    if (!team) return
    reset({
      team_name: team.team_name || '',
      organization_name: team.organization_name || '',
      city: team.city || '',
      state: team.state || '',
      country: team.country || 'India',
      address: team.address || '',
      contact_phone: team.contact_phone || '',
      contact_email: team.contact_email || '',
      manager_id: team.manager_id ? String(team.manager_id) : ''
    })
  }, [team, reset])

  const updateMutation = useMutation({
    mutationFn: (body) => api.put(`/teams/${id}`, body),
    onSuccess: () => {
      toast.success('Team updated')
      queryClient.invalidateQueries({ queryKey: ['team', id] })
      queryClient.invalidateQueries({ queryKey: ['teams'] })
      queryClient.invalidateQueries({ queryKey: ['available-team-managers'] })
      queryClient.invalidateQueries({ queryKey: ['competition-teams'] })
      navigate(`/teams/${id}`)
    },
    onError: (error) => toast.error(error.response?.data?.message || 'Failed to update team')
  })

  const onSubmit = (form) => {
    const body = { ...form }
    // Only an admin may move a team to another manager
    if (isAdmin && form.manager_id) body.manager_id = Number(form.manager_id)
    else delete body.manager_id
    updateMutation.mutate(body)
  }

  if (isLoading) {
    return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div></div>
  }

  if (!team) {
    return <div className="card text-center py-12">Team not found</div>
  }

  // The current manager may not be a team_manager account (older teams were
  // created by whoever was signed in), so surface that rather than hiding it.
  const currentInList = available.some((m) => m.id === team.manager_id)

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(`/teams/${id}`)} className="p-2 rounded-lg hover:bg-gray-100">
          <FiArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold">Edit Team</h1>
          <p className="text-gray-500">{team.team_name} · {team.team_code}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="card space-y-4">
        <div>
          <label className="label">Team Name *</label>
          <input
            className="input"
            {...register('team_name', { required: 'Team name is required' })}
          />
          {errors.team_name && <p className="text-red-500 text-sm mt-1">{errors.team_name.message}</p>}
        </div>

        {isAdmin && (
          <div>
            <label className="label">Team Manager *</label>
            <select
              className="input"
              {...register('manager_id', { required: 'Select the team manager' })}
            >
              <option value="">Select a team manager</option>
              {/* Keep the existing manager selectable even if their account is not
                  an eligible team_manager, so saving does not silently reassign */}
              {!currentInList && team.manager_id && (
                <option value={team.manager_id}>
                  {team.manager_name || 'Current manager'} (current)
                </option>
              )}
              {available.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.full_name} — {m.username}
                  {m.id === team.manager_id ? ' (current)' : ''}
                </option>
              ))}
            </select>
            <p className="text-gray-500 text-xs mt-1">
              Managers already running another team are not listed — each manager runs one team.
            </p>
            {errors.manager_id && <p className="text-red-500 text-sm mt-1">{errors.manager_id.message}</p>}

            {!currentInList && team.manager_id && (
              <p className="text-amber-700 text-xs mt-2 bg-amber-50 rounded-lg p-2 flex items-start gap-2">
                <FiInfo className="w-3 h-3 mt-0.5 shrink-0" />
                This team is currently held by an account that is not an active team
                manager. Pick a team manager to hand it over.
              </p>
            )}

            {assigned.length > 0 && (
              <details className="mt-2">
                <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700">
                  {assigned.length} manager{assigned.length === 1 ? '' : 's'} running another team
                </summary>
                <ul className="mt-1 space-y-0.5">
                  {assigned.map((a) => (
                    <li key={a.id} className="text-xs text-gray-400">
                      {a.full_name} — {a.teams.join(', ')}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}

        <div>
          <label className="label">Organization Name</label>
          <input className="input" {...register('organization_name')} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label">City</label>
            <input className="input" {...register('city')} />
          </div>
          <div>
            <label className="label">State</label>
            <input className="input" {...register('state')} />
          </div>
          <div>
            <label className="label">Country</label>
            <input className="input" {...register('country')} />
          </div>
          <div>
            <label className="label">Contact Phone</label>
            <input className="input" {...register('contact_phone')} />
          </div>
        </div>

        <div>
          <label className="label">Contact Email</label>
          <input
            type="email"
            className="input"
            {...register('contact_email', {
              validate: (v) => !v || /^\S+@\S+$/.test(v) || 'Invalid email address'
            })}
          />
          {errors.contact_email && <p className="text-red-500 text-sm mt-1">{errors.contact_email.message}</p>}
        </div>

        <div>
          <label className="label">Address</label>
          <textarea className="input" rows={2} {...register('address')} />
        </div>

        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={updateMutation.isPending} className="btn btn-primary">
            {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
          </button>
          <button type="button" onClick={() => navigate(`/teams/${id}`)} className="btn btn-outline">
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}

export default EditTeam
