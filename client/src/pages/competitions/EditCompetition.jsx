import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import { FiArrowLeft } from 'react-icons/fi'
import CategoryPicker from '../../components/CategoryPicker'

// The API returns DATE columns as ISO timestamps at UTC (e.g. a 19 June date comes
// back as "2026-06-18T18:30:00.000Z" from IST). Slicing that string would show — and
// then save — the previous day, so build the value from the LOCAL date parts instead.
const toDateInput = (value) => {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 10)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const EditCompetition = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { register, handleSubmit, reset, formState: { errors } } = useForm()

  const { data: competition, isLoading } = useQuery({
    queryKey: ['competition', id],
    queryFn: async () => {
      const res = await api.get(`/competitions/${id}`)
      return res.data.data
    }
  })

  const { data: ageGroups } = useQuery({
    queryKey: ['age-groups'],
    queryFn: async () => {
      const res = await api.get('/age-groups')
      return res.data.data
    }
  })

  // Load the existing values once the competition arrives
  useEffect(() => {
    if (!competition) return
    reset({
      competition_name: competition.competition_name,
      description: competition.description || '',
      venue: competition.venue || '',
      address: competition.address || '',
      city: competition.city || '',
      state: competition.state || '',
      start_date: toDateInput(competition.start_date),
      end_date: toDateInput(competition.end_date),
      registration_start_date: toDateInput(competition.registration_start_date),
      registration_end_date: toDateInput(competition.registration_end_date),
      max_teams: competition.max_teams ?? '',
      max_players_per_team: competition.max_players_per_team ?? '',
      entry_fee: competition.entry_fee ?? 0,
      prize_pool: competition.prize_pool ?? 0,
      organizer_name: competition.organizer_name || '',
      organizer_contact: competition.organizer_contact || '',
      rules: competition.rules || ''
    })
  }, [competition, reset])

  const updateMutation = useMutation({
    mutationFn: (data) => api.put(`/competitions/${id}`, data),
    onSuccess: () => {
      toast.success('Competition updated')
      queryClient.invalidateQueries({ queryKey: ['competition', id] })
      queryClient.invalidateQueries({ queryKey: ['competitions'] })
      navigate(`/competitions/${id}`)
    },
    onError: (error) => toast.error(error.response?.data?.message || 'Failed to update competition')
  })

  const addCategoryMutation = useMutation({
    mutationFn: (payload) => api.post(`/competitions/${id}/categories`, payload),
    onSuccess: (res) => {
      toast.success(res.data.message)
      queryClient.invalidateQueries({ queryKey: ['competition', id] })
      queryClient.invalidateQueries({ queryKey: ['score-sheet-options'] })
    },
    onError: (error) => toast.error(error.response?.data?.message || 'Failed to add categories')
  })

  const onSubmit = (form) => {
    updateMutation.mutate({
      ...form,
      max_teams: form.max_teams === '' ? null : Number(form.max_teams),
      max_players_per_team: form.max_players_per_team === '' ? null : Number(form.max_players_per_team),
      entry_fee: form.entry_fee === '' ? 0 : Number(form.entry_fee),
      prize_pool: form.prize_pool === '' ? 0 : Number(form.prize_pool)
    })
  }

  if (isLoading) {
    return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div></div>
  }

  if (!competition) {
    return <div className="card text-center py-12">Competition not found</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(`/competitions/${id}`)} className="p-2 rounded-lg hover:bg-gray-100">
          <FiArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold">Edit Competition</h1>
          <p className="text-gray-500">{competition.competition_name} · {competition.competition_code}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <div className="card space-y-4">
          <h2 className="text-lg font-semibold">Details</h2>

          <div>
            <label className="label">Competition Name</label>
            <input
              className="input"
              {...register('competition_name', { required: 'Competition name is required' })}
            />
            {errors.competition_name && <p className="text-red-500 text-sm mt-1">{errors.competition_name.message}</p>}
          </div>

          <div>
            <label className="label">Description</label>
            <textarea className="input" rows={2} {...register('description')} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label">Venue</label>
              <input className="input" {...register('venue')} />
            </div>
            <div>
              <label className="label">Address</label>
              <input className="input" {...register('address')} />
            </div>
            <div>
              <label className="label">City</label>
              <input className="input" {...register('city')} />
            </div>
            <div>
              <label className="label">State</label>
              <input className="input" {...register('state')} />
            </div>
          </div>
        </div>

        <div className="card space-y-4">
          <h2 className="text-lg font-semibold">Dates</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="label">Start Date</label>
              <input type="date" className="input" {...register('start_date', { required: 'Start date is required' })} />
              {errors.start_date && <p className="text-red-500 text-sm mt-1">{errors.start_date.message}</p>}
            </div>
            <div>
              <label className="label">End Date</label>
              <input type="date" className="input" {...register('end_date', { required: 'End date is required' })} />
              {errors.end_date && <p className="text-red-500 text-sm mt-1">{errors.end_date.message}</p>}
            </div>
            <div>
              <label className="label">Registration Opens</label>
              <input type="date" className="input" {...register('registration_start_date', { required: 'Required' })} />
              {errors.registration_start_date && <p className="text-red-500 text-sm mt-1">{errors.registration_start_date.message}</p>}
            </div>
            <div>
              <label className="label">Registration Closes</label>
              <input type="date" className="input" {...register('registration_end_date', { required: 'Required' })} />
              {errors.registration_end_date && <p className="text-red-500 text-sm mt-1">{errors.registration_end_date.message}</p>}
            </div>
          </div>
        </div>

        <div className="card space-y-4">
          <h2 className="text-lg font-semibold">Limits, Fees &amp; Organizer</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="label">Max Teams</label>
              <input type="number" min="0" className="input" {...register('max_teams')} />
            </div>
            <div>
              <label className="label">Max Players / Team</label>
              <input type="number" min="0" className="input" {...register('max_players_per_team')} />
            </div>
            <div>
              <label className="label">Entry Fee (₹)</label>
              <input type="number" step="0.01" min="0" className="input" {...register('entry_fee')} />
            </div>
            <div>
              <label className="label">Prize Pool (₹)</label>
              <input type="number" step="0.01" min="0" className="input" {...register('prize_pool')} />
            </div>
            <div>
              <label className="label">Organizer Name</label>
              <input className="input" {...register('organizer_name')} />
            </div>
            <div>
              <label className="label">Organizer Contact</label>
              <input className="input" {...register('organizer_contact')} />
            </div>
          </div>
          <div>
            <label className="label">Rules</label>
            <textarea className="input" rows={3} {...register('rules')} />
          </div>
        </div>

        <div className="flex gap-3">
          <button type="submit" disabled={updateMutation.isPending} className="btn btn-primary">
            {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
          </button>
          <button type="button" onClick={() => navigate(`/competitions/${id}`)} className="btn btn-outline">
            Cancel
          </button>
        </div>
      </form>

      {/* Categories are managed separately: each is its own row and removing one
          would cascade to entries, so they are added here but not deleted. */}
      <div className="card space-y-4">
        <h2 className="text-lg font-semibold">Categories</h2>

        {competition.categories?.length === 0 ? (
          <p className="text-sm text-gray-500">No categories yet.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {competition.categories?.map((cat) => (
              <span key={cat.id} className="px-3 py-1 text-sm rounded-full bg-gray-100 text-gray-700">
                <span className="capitalize">{cat.category}</span> — {cat.age_group_name?.trim()}
              </span>
            ))}
          </div>
        )}

        <CategoryPicker
          ageGroups={ageGroups}
          existing={competition.categories || []}
          pending={addCategoryMutation.isPending}
          onAdd={(category, ageGroupIds) =>
            addCategoryMutation.mutate({ category, age_group_ids: ageGroupIds })}
        />
      </div>
    </div>
  )
}

export default EditCompetition
