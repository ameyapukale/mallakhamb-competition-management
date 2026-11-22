import { useNavigate, useParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import { FiArrowLeft } from 'react-icons/fi'
import { useEffect } from 'react'

const EditPlayer = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  
  const { register, handleSubmit, formState: { errors }, reset } = useForm()

  const { data: player, isLoading } = useQuery({
    queryKey: ['player', id],
    queryFn: async () => {
      const res = await api.get(`/players/${id}`)
      return res.data.data
    }
  })

  const { data: teams } = useQuery({
    queryKey: ['teams'],
    queryFn: async () => {
      const res = await api.get('/teams')
      return res.data.data
    }
  })

  useEffect(() => {
    if (player) {
      reset({
        team_id: player.team_id,
        first_name: player.first_name,
        last_name: player.last_name,
        date_of_birth: player.date_of_birth?.split('T')[0],
        gender: player.gender,
        category: player.category,
        height_cm: player.height_cm,
        weight_kg: player.weight_kg,
        experience_years: player.experience_years,
        aadhar_number: player.aadhar_number,
        achievements: player.achievements
      })
    }
  }, [player, reset])

  const updatePlayerMutation = useMutation({
    mutationFn: (data) => api.put(`/players/${id}`, data),
    onSuccess: () => {
      toast.success('Player updated successfully!')
      queryClient.invalidateQueries(['players'])
      queryClient.invalidateQueries(['player', id])
      navigate(-1)
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || 'Failed to update player')
    }
  })

  const onSubmit = (data) => {
    updatePlayerMutation.mutate(data)
  }

  if (isLoading) {
    return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div></div>
  }

  return (
    <div className="max-w-2xl mx-auto">
      <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6">
        <FiArrowLeft /> Back
      </button>

      <div className="card">
        <h1 className="text-2xl font-bold mb-2">Edit Player</h1>
        <p className="text-gray-500 mb-6">Registration: {player?.registration_number}</p>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="label">Team *</label>
            <select {...register('team_id', { required: 'Team is required' })} className="input">
              <option value="">Select team</option>
              {teams?.map((team) => (
                <option key={team.id} value={team.id}>{team.team_name}</option>
              ))}
            </select>
            {errors.team_id && <p className="text-red-500 text-sm mt-1">{errors.team_id.message}</p>}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label">First Name *</label>
              <input
                type="text"
                {...register('first_name', { required: 'First name is required' })}
                className="input"
                placeholder="First name"
              />
              {errors.first_name && <p className="text-red-500 text-sm mt-1">{errors.first_name.message}</p>}
            </div>
            <div>
              <label className="label">Last Name *</label>
              <input
                type="text"
                {...register('last_name', { required: 'Last name is required' })}
                className="input"
                placeholder="Last name"
              />
              {errors.last_name && <p className="text-red-500 text-sm mt-1">{errors.last_name.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label">Date of Birth *</label>
              <input
                type="date"
                {...register('date_of_birth', { required: 'Date of birth is required' })}
                className="input"
              />
              {errors.date_of_birth && <p className="text-red-500 text-sm mt-1">{errors.date_of_birth.message}</p>}
            </div>
            <div>
              <label className="label">Gender *</label>
              <select {...register('gender', { required: 'Gender is required' })} className="input">
                <option value="">Select gender</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
              {errors.gender && <p className="text-red-500 text-sm mt-1">{errors.gender.message}</p>}
            </div>
          </div>

          <div>
            <label className="label">Category *</label>
            <select {...register('category', { required: 'Category is required' })} className="input">
              <option value="">Select category</option>
              <option value="pole">Pole (मल्लखांब)</option>
              <option value="rope">Rope (दोरी मल्लखांब)</option>
              <option value="hanging">Hanging (हँगिंग मल्लखांब)</option>
            </select>
            {errors.category && <p className="text-red-500 text-sm mt-1">{errors.category.message}</p>}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label">Height (cm)</label>
              <input
                type="number"
                step="0.1"
                {...register('height_cm')}
                className="input"
                placeholder="Height in cm"
              />
            </div>
            <div>
              <label className="label">Weight (kg)</label>
              <input
                type="number"
                step="0.1"
                {...register('weight_kg')}
                className="input"
                placeholder="Weight in kg"
              />
            </div>
          </div>

          <div>
            <label className="label">Experience (years)</label>
            <input
              type="number"
              {...register('experience_years')}
              className="input"
              placeholder="Years of experience"
            />
          </div>

          <div>
            <label className="label">Aadhar Number</label>
            <input
              type="text"
              {...register('aadhar_number')}
              className="input"
              placeholder="12-digit Aadhar number"
              maxLength="12"
            />
          </div>

          <div>
            <label className="label">Achievements</label>
            <textarea
              {...register('achievements')}
              className="input"
              rows="3"
              placeholder="Previous achievements and awards"
            />
          </div>

          <div className="flex justify-end gap-4 pt-4">
            <button type="button" onClick={() => navigate(-1)} className="btn btn-outline">
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={updatePlayerMutation.isPending}>
              {updatePlayerMutation.isPending ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default EditPlayer
