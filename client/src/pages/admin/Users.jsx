import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import { useAuthStore } from '../../store/authStore'
import { FiUserCheck, FiUserX, FiEdit2, FiX } from 'react-icons/fi'

// Roles an admin can filter by or assign. 'scorer' is retired and deliberately
// absent, so it can never be picked again.
const roleLabels = {
  admin: 'Admin',
  team_manager: 'Team Manager',
  judge: 'Judge'
}

// Kept only so a legacy row still renders with a readable name
const legacyRoleLabels = { ...roleLabels, scorer: 'Scorer' }

const roleBadges = {
  admin: 'bg-purple-100 text-purple-700',
  team_manager: 'bg-blue-100 text-blue-700',
  judge: 'bg-green-100 text-green-700',
  scorer: 'bg-orange-100 text-orange-700'
}

const Users = () => {
  const queryClient = useQueryClient()
  const { user: currentUser } = useAuthStore()
  const [filters, setFilters] = useState({ role: '', is_active: '' })
  const [editing, setEditing] = useState(null)

  const { register, handleSubmit, reset, formState: { errors } } = useForm()

  const { data: users, isLoading } = useQuery({
    queryKey: ['users', filters],
    queryFn: async () => {
      const params = Object.fromEntries(Object.entries(filters).filter(([_, v]) => v))
      const res = await api.get('/users', { params })
      return res.data.data
    }
  })

  // Load the selected user's current values into the form
  useEffect(() => {
    if (editing) {
      reset({
        username: editing.username,
        email: editing.email,
        full_name: editing.full_name,
        phone: editing.phone || '',
        role: editing.role
      })
    }
  }, [editing, reset])

  const toggleStatusMutation = useMutation({
    mutationFn: ({ id, is_active }) => api.patch(`/users/${id}/status`, { is_active }),
    onSuccess: () => {
      toast.success('User status updated')
      queryClient.invalidateQueries({ queryKey: ['users'] })
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || 'Failed to update status')
    }
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, ...body }) => api.put(`/users/${id}`, body),
    onSuccess: (res) => {
      toast.success(res.data.message)
      setEditing(null)
      queryClient.invalidateQueries({ queryKey: ['users'] })
      queryClient.invalidateQueries({ queryKey: ['eligible-judges'] })
      queryClient.invalidateQueries({ queryKey: ['competition-judges'] })
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || 'Failed to update user')
    }
  })

  const onSubmit = (form) => {
    updateMutation.mutate({
      id: editing.id,
      username: form.username.trim(),
      email: form.email.trim(),
      full_name: form.full_name.trim(),
      phone: form.phone?.trim() || null,
      role: form.role
    })
  }

  const isSelf = editing && currentUser?.id === editing.id

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">User Management</h1>
        <p className="text-gray-500">
          Manage all system users. Username and email are unique per role, so one person
          can hold an account for more than one role.
        </p>
      </div>

      {/* Filters */}
      <div className="card">
        <div className="flex flex-wrap items-center gap-4">
          <select
            value={filters.role}
            onChange={(e) => setFilters({ ...filters, role: e.target.value })}
            className="input max-w-xs"
          >
            <option value="">All Roles</option>
            {Object.entries(roleLabels).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <select
            value={filters.is_active}
            onChange={(e) => setFilters({ ...filters, is_active: e.target.value })}
            className="input max-w-xs"
          >
            <option value="">All Status</option>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>
        </div>
      </div>

      {/* Edit form, shown above the table so it is obvious what is being edited */}
      {editing && (
        <form onSubmit={handleSubmit(onSubmit)} className="card space-y-4 border-l-4 border-primary-500">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">Edit {editing.full_name}</h2>
              <p className="text-sm text-gray-500">
                Account #{editing.id} · currently {legacyRoleLabels[editing.role] || editing.role}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="p-2 rounded-lg hover:bg-gray-100"
              title="Cancel"
            >
              <FiX className="w-5 h-5" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label">Full Name</label>
              <input
                className="input"
                {...register('full_name', { required: 'Full name is required' })}
              />
              {errors.full_name && <p className="text-red-500 text-sm mt-1">{errors.full_name.message}</p>}
            </div>

            <div>
              <label className="label">Role</label>
              <select
                className="input"
                disabled={isSelf}
                {...register('role', { required: 'Role is required' })}
              >
                {Object.entries(roleLabels).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
              {isSelf && (
                <p className="text-gray-500 text-xs mt-1">
                  You cannot change your own role.
                </p>
              )}
              {errors.role && <p className="text-red-500 text-sm mt-1">{errors.role.message}</p>}
            </div>

            <div>
              <label className="label">Username</label>
              <input
                className="input"
                {...register('username', {
                  required: 'Username is required',
                  minLength: { value: 3, message: 'At least 3 characters' }
                })}
              />
              {errors.username && <p className="text-red-500 text-sm mt-1">{errors.username.message}</p>}
            </div>

            <div>
              <label className="label">Email</label>
              <input
                type="email"
                className="input"
                {...register('email', {
                  required: 'Email is required',
                  pattern: { value: /^\S+@\S+$/i, message: 'Invalid email address' }
                })}
              />
              {errors.email && <p className="text-red-500 text-sm mt-1">{errors.email.message}</p>}
            </div>

            <div>
              <label className="label">Phone</label>
              <input className="input" {...register('phone')} />
            </div>
          </div>

          <div className="flex gap-3">
            <button type="submit" disabled={updateMutation.isPending} className="btn btn-primary">
              {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
            </button>
            <button type="button" onClick={() => setEditing(null)} className="btn btn-outline">
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Users Table */}
      <div className="card overflow-x-auto">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="table-header">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Username</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {users?.map((user) => (
                <tr
                  key={user.id}
                  className={`hover:bg-gray-50 ${editing?.id === user.id ? 'bg-primary-50' : ''}`}
                >
                  <td className="px-4 py-3 font-medium">{user.full_name}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{user.username}</td>
                  <td className="px-4 py-3 text-sm">{user.email}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{user.phone || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 text-xs rounded-full ${roleBadges[user.role] || 'bg-gray-100 text-gray-700'}`}>
                      {legacyRoleLabels[user.role] || user.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 text-xs rounded-full ${
                      user.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                    }`}>
                      {user.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setEditing(user)}
                        className="p-1 rounded text-primary-600 hover:bg-primary-50"
                        title={`Edit ${user.full_name}`}
                      >
                        <FiEdit2 />
                      </button>
                      <button
                        onClick={() => toggleStatusMutation.mutate({
                          id: user.id,
                          is_active: !user.is_active
                        })}
                        className={`p-1 rounded ${
                          user.is_active
                            ? 'text-red-500 hover:bg-red-50'
                            : 'text-green-500 hover:bg-green-50'
                        }`}
                        title={user.is_active ? 'Deactivate' : 'Activate'}
                      >
                        {user.is_active ? <FiUserX /> : <FiUserCheck />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

export default Users
