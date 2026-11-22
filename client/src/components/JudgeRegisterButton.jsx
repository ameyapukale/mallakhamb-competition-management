import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import api from '../services/api'
import { useAuthStore } from '../store/authStore'
import { FiCheckCircle } from 'react-icons/fi'

/**
 * Register / withdraw control for a judge or scorer on one competition.
 * Renders nothing for other roles, or when the competition is not open to judges.
 * Shares the 'judge-active-competitions' query with the rest of the app, so several
 * of these on one page cost a single request.
 */
const JudgeRegisterButton = ({ competitionId, size = 'normal' }) => {
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  const isJudge = ['judge', 'scorer'].includes(user?.role)

  const { data: competitions, isLoading } = useQuery({
    queryKey: ['judge-active-competitions'],
    queryFn: async () => {
      const res = await api.get('/competitions/judge/active')
      return res.data.data
    },
    enabled: isJudge
  })

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['judge-active-competitions'] })
    queryClient.invalidateQueries({ queryKey: ['my-panels'] })
    queryClient.invalidateQueries({ queryKey: ['competition-judges'] })
  }

  const registerMutation = useMutation({
    mutationFn: () => api.post(`/competitions/${competitionId}/judges/register`),
    onSuccess: (res) => { toast.success(res.data.message); refresh() },
    onError: (error) => toast.error(error.response?.data?.message || 'Failed to register')
  })

  const withdrawMutation = useMutation({
    mutationFn: () => api.delete(`/competitions/${competitionId}/judges/register`),
    onSuccess: (res) => { toast.success(res.data.message); refresh() },
    onError: (error) => toast.error(error.response?.data?.message || 'Failed to withdraw')
  })

  if (!isJudge || isLoading) return null

  // Absent from this list means the competition is not accepting judges right now
  const competition = competitions?.find((c) => String(c.id) === String(competitionId))
  if (!competition) return null

  const pending = registerMutation.isPending || withdrawMutation.isPending
  const btnSize = size === 'small' ? 'text-sm py-1 px-3' : ''

  if (competition.is_registered) {
    return (
      <div className="flex items-center gap-3 flex-wrap">
        <span className="inline-flex items-center gap-1 text-green-700 bg-green-50 rounded-lg px-3 py-2 text-sm font-medium">
          <FiCheckCircle className="w-4 h-4" /> You are registered
        </span>
        <button
          type="button"
          onClick={() => withdrawMutation.mutate()}
          disabled={pending}
          className="text-sm text-gray-500 hover:text-red-600 hover:underline disabled:opacity-50"
        >
          Withdraw
        </button>
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={() => registerMutation.mutate()}
      disabled={pending}
      className={`btn btn-primary ${btnSize}`}
    >
      {pending ? 'Please wait...' : 'Register as Judge'}
    </button>
  )
}

export default JudgeRegisterButton
