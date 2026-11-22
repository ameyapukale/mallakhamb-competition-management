import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import { FiArrowLeft } from 'react-icons/fi'
import api from '../../services/api'
import CompetitionForm from '../../components/CompetitionForm'
import { errorMessage } from '../../utils/competition'

// Create (/admin/competitions/new) or edit (/admin/competitions/:id/edit)
const CompetitionEditor = () => {
  const { id } = useParams()
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: competition, isLoading } = useQuery({
    queryKey: ['admin-competition', id],
    queryFn: async () => (await api.get(`/admin/competitions/${id}`)).data.data,
    enabled: isEdit
  })

  const saveMutation = useMutation({
    mutationFn: (payload) => isEdit
      ? api.put(`/admin/competitions/${id}`, payload)
      : api.post('/admin/competitions', payload),
    onSuccess: (res) => {
      const unassigned = res.data.data?.unassigned || []
      if (unassigned.length) toast(res.data.message, { icon: '⚠️', duration: 8000 })
      else toast.success(res.data.message)
      queryClient.invalidateQueries({ queryKey: ['admin-competitions'] })
      queryClient.invalidateQueries({ queryKey: ['admin-competition'] })
      navigate(`/admin/competitions/${isEdit ? id : res.data.data.competitionId}`)
    },
    onError: (error) => toast.error(errorMessage(error, 'Failed to save competition'), { duration: 6000 })
  })

  if (isEdit && isLoading) return <div className="text-center py-16 text-gray-500">Loading…</div>

  return (
    <div className="max-w-4xl mx-auto">
      <Link
        to={isEdit ? `/admin/competitions/${id}` : '/admin'}
        className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6"
      >
        <FiArrowLeft /> Back
      </Link>
      <div className="card">
        <h1 className="text-2xl font-bold mb-6">{isEdit ? 'Edit competition' : 'Create competition'}</h1>
        <CompetitionForm
          initial={competition}
          scoringStarted={competition?.scoring_started}
          onSubmit={(payload) => saveMutation.mutate(payload)}
          onCancel={() => navigate(isEdit ? `/admin/competitions/${id}` : '/admin')}
          submitting={saveMutation.isPending}
          submitLabel={isEdit ? 'Save changes' : 'Create competition'}
        />
      </div>
    </div>
  )
}

export default CompetitionEditor
