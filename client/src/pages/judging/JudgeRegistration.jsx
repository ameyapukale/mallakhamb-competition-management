import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import { FiCalendar, FiMapPin, FiCheckCircle, FiUsers } from 'react-icons/fi'

const statusLabels = {
  registration_open: 'Registration open',
  registration_closed: 'Registration closed',
  ongoing: 'Ongoing'
}

const JudgeRegistration = () => {
  const queryClient = useQueryClient()

  const { data: competitions, isLoading } = useQuery({
    queryKey: ['judge-active-competitions'],
    queryFn: async () => {
      const res = await api.get('/competitions/judge/active')
      return res.data.data
    }
  })

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['judge-active-competitions'] })
    queryClient.invalidateQueries({ queryKey: ['my-panels'] })
  }

  const registerMutation = useMutation({
    mutationFn: (competitionId) => api.post(`/competitions/${competitionId}/judges/register`),
    onSuccess: (res) => {
      toast.success(res.data.message)
      refresh()
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || 'Failed to register')
    }
  })

  const withdrawMutation = useMutation({
    mutationFn: (competitionId) => api.delete(`/competitions/${competitionId}/judges/register`),
    onSuccess: (res) => {
      toast.success(res.data.message)
      refresh()
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || 'Failed to withdraw')
    }
  })

  const pending = registerMutation.isPending || withdrawMutation.isPending

  if (isLoading) {
    return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div></div>
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Competition Registration</h1>
        <p className="text-gray-500">Register yourself for a competition to be eligible for a judge panel</p>
      </div>

      {!competitions?.length ? (
        <div className="card text-center py-12">
          <FiCalendar className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No active competitions</h3>
          <p className="text-gray-500">There is nothing open for registration right now.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {competitions.map((comp) => (
            <div key={comp.id} className="card flex flex-col">
              <div className="flex items-start justify-between gap-3 mb-2">
                <h3 className="font-semibold text-lg">{comp.competition_name}</h3>
                <span className="px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-600 whitespace-nowrap">
                  {statusLabels[comp.status] || comp.status}
                </span>
              </div>

              <div className="space-y-1 text-sm text-gray-500 mb-4">
                {comp.venue && (
                  <p className="flex items-center gap-2">
                    <FiMapPin className="w-4 h-4 shrink-0" />
                    {comp.venue}{comp.city ? `, ${comp.city}` : ''}
                  </p>
                )}
                <p className="flex items-center gap-2">
                  <FiCalendar className="w-4 h-4 shrink-0" />
                  {new Date(comp.start_date).toLocaleDateString()} – {new Date(comp.end_date).toLocaleDateString()}
                </p>
                <p className="flex items-center gap-2">
                  <FiUsers className="w-4 h-4 shrink-0" />
                  {comp.registered_judges} judge{comp.registered_judges === 1 ? '' : 's'} registered
                </p>
              </div>

              <div className="mt-auto">
                {comp.is_registered ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-green-700 bg-green-50 rounded-lg px-3 py-2 text-sm font-medium">
                      <FiCheckCircle className="w-4 h-4" />
                      You are registered
                    </div>
                    <button
                      onClick={() => withdrawMutation.mutate(comp.id)}
                      disabled={pending}
                      className="text-sm text-gray-500 hover:text-red-600 hover:underline disabled:opacity-50"
                    >
                      Withdraw registration
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => registerMutation.mutate(comp.id)}
                    disabled={pending}
                    className="btn btn-primary w-full"
                  >
                    {pending ? 'Please wait...' : 'Register as Judge'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default JudgeRegistration
