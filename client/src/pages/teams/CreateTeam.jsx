import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import { useAuthStore } from '../../store/authStore'
import { FiArrowLeft, FiInfo } from 'react-icons/fi'

const CreateTeam = () => {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const isAdmin = user?.role === 'admin'
  const { register, handleSubmit, formState: { errors } } = useForm()

  // Only an admin nominates the manager; a team manager always manages their own team
  const { data: managers, isLoading: loadingManagers } = useQuery({
    queryKey: ['available-team-managers'],
    queryFn: async () => {
      const res = await api.get('/users/team-managers/available')
      return res.data.data
    },
    enabled: isAdmin
  })

  const available = managers?.available || []
  const assigned = managers?.assigned || []

  const createTeamMutation = useMutation({
    mutationFn: (data) => api.post('/teams', data),
    onSuccess: (response) => {
      toast.success('Team created successfully!')
      navigate(`/teams/${response.data.data.teamId}`)
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || 'Failed to create team')
    }
  })

  const onSubmit = (data) => {
    createTeamMutation.mutate({
      ...data,
      manager_id: isAdmin && data.manager_id ? Number(data.manager_id) : undefined
    })
  }

  return (
    <div className="max-w-2xl mx-auto">
      <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6">
        <FiArrowLeft /> Back
      </button>

      <div className="card">
        <h1 className="text-2xl font-bold mb-6">Create New Team</h1>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="label">Team Name *</label>
            <input
              type="text"
              {...register('team_name', { required: 'Team name is required' })}
              className="input"
              placeholder="Enter team name"
            />
            {errors.team_name && <p className="text-red-500 text-sm mt-1">{errors.team_name.message}</p>}
          </div>

          {/* Admin nominates the manager. Only managers without a team are listed,
              so each manager ends up running exactly one team. */}
          {isAdmin && (
            <div>
              <label className="label">Team Manager *</label>

              {loadingManagers ? (
                <p className="text-sm text-gray-500">Loading team managers…</p>
              ) : available.length === 0 ? (
                <div className="text-sm text-amber-700 bg-amber-50 rounded-lg p-3 flex items-start gap-2">
                  <FiInfo className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>
                    Every team manager already runs a team. Register a new team manager
                    account first — from <span className="font-medium">Users</span> or the
                    sign-up page — and they will appear here.
                  </span>
                </div>
              ) : (
                <>
                  <select
                    {...register('manager_id', { required: 'Select the team manager' })}
                    className="input"
                    defaultValue=""
                  >
                    <option value="">Select a team manager</option>
                    {available.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.full_name} — {m.username}
                      </option>
                    ))}
                  </select>
                  <p className="text-gray-500 text-xs mt-1">
                    Only managers without a team are listed, so each team keeps a single manager.
                  </p>
                </>
              )}

              {errors.manager_id && <p className="text-red-500 text-sm mt-1">{errors.manager_id.message}</p>}

              {assigned.length > 0 && (
                <details className="mt-2">
                  <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700">
                    {assigned.length} manager{assigned.length === 1 ? '' : 's'} already assigned
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
            <input
              type="text"
              {...register('organization_name')}
              className="input"
              placeholder="School/Club/Academy name"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label">City</label>
              <input
                type="text"
                {...register('city')}
                className="input"
                placeholder="City"
              />
            </div>
            <div>
              <label className="label">State</label>
              <input
                type="text"
                {...register('state')}
                className="input"
                placeholder="State"
              />
            </div>
          </div>

          <div>
            <label className="label">Address</label>
            <textarea
              {...register('address')}
              className="input"
              rows="2"
              placeholder="Full address"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label">Contact Phone</label>
              <input
                type="tel"
                {...register('contact_phone')}
                className="input"
                placeholder="Contact phone number"
              />
            </div>
            <div>
              <label className="label">Contact Email</label>
              <input
                type="email"
                {...register('contact_email')}
                className="input"
                placeholder="Contact email"
              />
            </div>
          </div>

          <div className="flex justify-end gap-4 pt-4">
            <button type="button" onClick={() => navigate(-1)} className="btn btn-outline">
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={createTeamMutation.isPending}>
              {createTeamMutation.isPending ? 'Creating...' : 'Create Team'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default CreateTeam
