import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { useQuery, useMutation } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import { FiArrowLeft } from 'react-icons/fi'
import { useState } from 'react'
import CategoryPicker from '../../components/CategoryPicker'

const CreateCompetition = () => {
  const navigate = useNavigate()
  const { register, handleSubmit, formState: { errors } } = useForm()
  const [categories, setCategories] = useState([])

  const { data: ageGroups } = useQuery({
    queryKey: ['age-groups'],
    queryFn: async () => {
      const res = await api.get('/age-groups')
      return res.data.data
    }
  })

  const createMutation = useMutation({
    mutationFn: (data) => api.post('/competitions', { ...data, categories }),
    onSuccess: (response) => {
      toast.success('Competition created successfully!')
      navigate(`/competitions/${response.data.data.competitionId}`)
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || 'Failed to create competition')
    }
  })

  // Adds one entry per ticked age group, skipping any already in the list
  const addCategories = (category, ageGroupIds) => {
    setCategories((prev) => {
      const fresh = ageGroupIds
        .map((id) => parseInt(id, 10))
        .filter((id) => !prev.some((c) => c.category === category && c.age_group_id === id))
        .map((id) => ({ category, age_group_id: id }))

      if (fresh.length === 0) {
        toast('Those age groups are already added for this category.', { icon: 'ℹ️' })
        return prev
      }
      toast.success(`${fresh.length} ${category} categor${fresh.length === 1 ? 'y' : 'ies'} added`)
      return [...prev, ...fresh]
    })
  }

  const removeCategory = (index) => {
    setCategories(categories.filter((_, i) => i !== index))
  }

  const onSubmit = (data) => {
    createMutation.mutate(data)
  }

  return (
    <div className="max-w-3xl mx-auto">
      <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6">
        <FiArrowLeft /> Back
      </button>

      <div className="card">
        <h1 className="text-2xl font-bold mb-6">Create New Competition</h1>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div>
            <label className="label">Competition Name *</label>
            <input
              type="text"
              {...register('competition_name', { required: 'Competition name is required' })}
              className="input"
              placeholder="e.g., Maharashtra State Mallakhamb Championship 2024"
            />
            {errors.competition_name && <p className="text-red-500 text-sm mt-1">{errors.competition_name.message}</p>}
          </div>

          <div>
            <label className="label">Description</label>
            <textarea
              {...register('description')}
              className="input"
              rows="3"
              placeholder="About the competition..."
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label">Start Date *</label>
              <input type="date" {...register('start_date', { required: 'Start date is required' })} className="input" />
              {errors.start_date && <p className="text-red-500 text-sm mt-1">{errors.start_date.message}</p>}
            </div>
            <div>
              <label className="label">End Date *</label>
              <input type="date" {...register('end_date', { required: 'End date is required' })} className="input" />
              {errors.end_date && <p className="text-red-500 text-sm mt-1">{errors.end_date.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label">Registration Start *</label>
              <input type="date" {...register('registration_start_date', { required: 'Required' })} className="input" />
            </div>
            <div>
              <label className="label">Registration End *</label>
              <input type="date" {...register('registration_end_date', { required: 'Required' })} className="input" />
            </div>
          </div>

          <div>
            <label className="label">Venue</label>
            <input type="text" {...register('venue')} className="input" placeholder="Venue name" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label">City</label>
              <input type="text" {...register('city')} className="input" placeholder="City" />
            </div>
            <div>
              <label className="label">State</label>
              <input type="text" {...register('state')} className="input" placeholder="State" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="label">Max Teams</label>
              <input type="number" {...register('max_teams')} className="input" placeholder="Unlimited" />
            </div>
            <div>
              <label className="label">Entry Fee (₹)</label>
              <input type="number" {...register('entry_fee')} className="input" placeholder="0" />
            </div>
            <div>
              <label className="label">Prize Pool (₹)</label>
              <input type="number" {...register('prize_pool')} className="input" placeholder="0" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label">Organizer Name</label>
              <input type="text" {...register('organizer_name')} className="input" placeholder="Organization name" />
            </div>
            <div>
              <label className="label">Organizer Contact</label>
              <input type="text" {...register('organizer_contact')} className="input" placeholder="Phone/Email" />
            </div>
          </div>

          {/* Categories */}
          <div className="border-t pt-6">
            <h2 className="text-lg font-semibold mb-4">Competition Categories</h2>
            
            <div className="mb-4">
              <CategoryPicker
                ageGroups={ageGroups}
                existing={categories}
                onAdd={addCategories}
              />
            </div>

            {categories.length > 0 && (
              <div className="space-y-2">
                {categories.map((cat, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <span>
                      <span className={`px-2 py-1 text-xs rounded-full mr-2 ${
                        cat.category === 'pole' ? 'bg-blue-100 text-blue-700' :
                        cat.category === 'rope' ? 'bg-green-100 text-green-700' :
                        'bg-purple-100 text-purple-700'
                      }`}>
                        {cat.category}
                      </span>
                      {ageGroups?.find(ag => ag.id === cat.age_group_id)?.group_name}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeCategory(index)}
                      className="text-red-500 hover:underline text-sm"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-4 pt-4">
            <button type="button" onClick={() => navigate(-1)} className="btn btn-outline">
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Creating...' : 'Create Competition'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default CreateCompetition
