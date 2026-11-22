import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import { FiPlus, FiEdit2, FiTrash2 } from 'react-icons/fi'

const AgeGroups = () => {
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm()

  const { data: ageGroups, isLoading } = useQuery({
    queryKey: ['age-groups'],
    queryFn: async () => {
      const res = await api.get('/age-groups')
      return res.data.data
    }
  })

  const createMutation = useMutation({
    mutationFn: (data) => api.post('/age-groups', data),
    onSuccess: () => {
      toast.success('Age group created successfully')
      queryClient.invalidateQueries(['age-groups'])
      setShowForm(false)
      reset()
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || 'Failed to create age group')
    }
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => api.put(`/age-groups/${id}`, data),
    onSuccess: () => {
      toast.success('Age group updated successfully')
      queryClient.invalidateQueries(['age-groups'])
      setEditingId(null)
      setShowForm(false)
      reset()
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || 'Failed to update age group')
    }
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/age-groups/${id}`),
    onSuccess: () => {
      toast.success('Age group deleted successfully')
      queryClient.invalidateQueries(['age-groups'])
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || 'Failed to delete age group')
    }
  })

  const handleEdit = (group) => {
    setEditingId(group.id)
    setValue('group_name', group.group_name)
    setValue('min_age', group.min_age)
    setValue('max_age', group.max_age)
    setValue('description', group.description)
    setShowForm(true)
  }

  const onSubmit = (data) => {
    if (editingId) {
      updateMutation.mutate({ id: editingId, data })
    } else {
      createMutation.mutate(data)
    }
  }

  const handleCancel = () => {
    setShowForm(false)
    setEditingId(null)
    reset()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Age Groups</h1>
          <p className="text-gray-500">Manage competition age categories</p>
        </div>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="btn btn-primary flex items-center gap-2"
          >
            <FiPlus /> Add Age Group
          </button>
        )}
      </div>

      {/* Add/Edit Form */}
      {showForm && (
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">
            {editingId ? 'Edit Age Group' : 'Add New Age Group'}
          </h2>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="label">Group Name *</label>
                <input
                  type="text"
                  {...register('group_name', { required: 'Group name is required' })}
                  className="input"
                  placeholder="e.g., Junior"
                />
                {errors.group_name && <p className="text-red-500 text-sm mt-1">{errors.group_name.message}</p>}
              </div>
              <div>
                <label className="label">Min Age *</label>
                <input
                  type="number"
                  {...register('min_age', { required: 'Min age is required', min: 0 })}
                  className="input"
                  placeholder="0"
                />
                {errors.min_age && <p className="text-red-500 text-sm mt-1">{errors.min_age.message}</p>}
              </div>
              <div>
                <label className="label">Max Age *</label>
                <input
                  type="number"
                  {...register('max_age', { required: 'Max age is required', min: 0 })}
                  className="input"
                  placeholder="100"
                />
                {errors.max_age && <p className="text-red-500 text-sm mt-1">{errors.max_age.message}</p>}
              </div>
            </div>
            <div>
              <label className="label">Description</label>
              <input
                type="text"
                {...register('description')}
                className="input"
                placeholder="Optional description"
              />
            </div>
            <div className="flex gap-2">
              <button type="submit" className="btn btn-primary">
                {editingId ? 'Update' : 'Create'}
              </button>
              <button type="button" onClick={handleCancel} className="btn btn-outline">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Age Groups Table */}
      <div className="card overflow-x-auto">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="table-header">
                <th className="px-4 py-3">Group Name</th>
                <th className="px-4 py-3">Age Range</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {ageGroups?.map((group) => (
                <tr key={group.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{group.group_name}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-1 bg-primary-100 text-primary-700 rounded text-sm">
                      {group.min_age} - {group.max_age} years
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">{group.description || '-'}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleEdit(group)}
                        className="p-1 text-blue-500 hover:bg-blue-50 rounded"
                      >
                        <FiEdit2 />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm('Are you sure you want to delete this age group?')) {
                            deleteMutation.mutate(group.id)
                          }
                        }}
                        className="p-1 text-red-500 hover:bg-red-50 rounded"
                      >
                        <FiTrash2 />
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

export default AgeGroups
