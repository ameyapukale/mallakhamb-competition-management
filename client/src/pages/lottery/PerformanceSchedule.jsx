import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import { useAuthStore } from '../../store/authStore'
import { FiPlay, FiCheck, FiSkipForward, FiEdit3 } from 'react-icons/fi'

const PerformanceSchedule = () => {
  const { competitionId } = useParams()
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  const [selectedCategory, setSelectedCategory] = useState('')

  const { data: competition } = useQuery({
    queryKey: ['competition', competitionId],
    queryFn: async () => {
      const res = await api.get(`/competitions/${competitionId}`)
      return res.data.data
    }
  })

  const { data: lotteryDraws } = useQuery({
    queryKey: ['lottery-draws', competitionId],
    queryFn: async () => {
      const res = await api.get(`/lottery/competition/${competitionId}`)
      return res.data.data
    }
  })

  const { data: sequence, refetch: refetchSequence } = useQuery({
    queryKey: ['lottery-sequence', selectedCategory],
    queryFn: async () => {
      const draw = lotteryDraws?.find(d => d.competition_category_id === parseInt(selectedCategory))
      if (!draw) return null
      const res = await api.get(`/lottery/sequence/${draw.id}`)
      return res.data.data
    },
    enabled: !!selectedCategory && !!lotteryDraws
  })

  const { data: currentPerformance, refetch: refetchCurrent } = useQuery({
    queryKey: ['current-performance', competitionId, selectedCategory],
    queryFn: async () => {
      const res = await api.get(`/lottery/current/${competitionId}/${selectedCategory}`)
      return res.data.data
    },
    enabled: !!selectedCategory,
    refetchInterval: 5000 // Refresh every 5 seconds
  })

  const updateStatusMutation = useMutation({
    mutationFn: ({ sequenceId, status }) => api.patch(`/lottery/performance/${sequenceId}/status`, { status }),
    onSuccess: () => {
      toast.success('Status updated')
      queryClient.invalidateQueries(['lottery-sequence', selectedCategory])
      queryClient.invalidateQueries(['current-performance'])
      refetchSequence()
      refetchCurrent()
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || 'Failed to update status')
    }
  })

  const handleStatusChange = (sequenceId, status) => {
    updateStatusMutation.mutate({ sequenceId, status })
  }

  const getPanelForCategory = () => {
    // Find panel for this category
    return lotteryDraws?.find(d => d.competition_category_id === parseInt(selectedCategory))
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Performance Schedule</h1>
          <p className="text-gray-500">{competition?.competition_name}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Category Selection */}
        <div className="card">
          <h2 className="font-semibold mb-4">Categories</h2>
          <div className="space-y-2">
            {competition?.categories?.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(String(cat.id))}
                className={`w-full text-left p-3 rounded-lg transition-colors ${
                  selectedCategory === String(cat.id)
                    ? 'bg-primary-100 text-primary-700'
                    : 'bg-gray-50 hover:bg-gray-100'
                }`}
              >
                <span className={`px-2 py-0.5 text-xs rounded ${
                  cat.category === 'pole' ? 'bg-blue-100 text-blue-700' :
                  cat.category === 'rope' ? 'bg-green-100 text-green-700' :
                  'bg-purple-100 text-purple-700'
                }`}>
                  {cat.category}
                </span>
                <p className="font-medium mt-1">{cat.age_group_name}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Main Content */}
        <div className="lg:col-span-3 space-y-4">
          {/* Current Performance Card */}
          {currentPerformance?.current && (
            <div className="card bg-yellow-50 border-2 border-yellow-400">
              <h3 className="font-semibold text-yellow-800 mb-2">🎯 Now Performing</h3>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xl font-bold">#{currentPerformance.current.sequence_number} - {currentPerformance.current.player_name}</p>
                  <p className="text-gray-600">{currentPerformance.current.team_name}</p>
                </div>
                {['admin', 'scorer'].includes(user?.role) && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleStatusChange(currentPerformance.current.id, 'completed')}
                      className="btn btn-secondary flex items-center gap-1"
                    >
                      <FiCheck /> Complete
                    </button>
                    <button
                      onClick={() => handleStatusChange(currentPerformance.current.id, 'skipped')}
                      className="btn btn-outline flex items-center gap-1"
                    >
                      <FiSkipForward /> Skip
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Next Up */}
          {currentPerformance?.next && (
            <div className="card bg-blue-50">
              <h3 className="font-semibold text-blue-800 mb-2">⏭ Up Next</h3>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">#{currentPerformance.next.sequence_number} - {currentPerformance.next.player_name}</p>
                  <p className="text-sm text-gray-600">{currentPerformance.next.team_name}</p>
                </div>
                {['admin', 'scorer'].includes(user?.role) && (
                  <button
                    onClick={() => handleStatusChange(currentPerformance.next.id, 'performing')}
                    className="btn btn-primary flex items-center gap-1"
                  >
                    <FiPlay /> Start
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Full Schedule */}
          <div className="card">
            <h2 className="font-semibold mb-4">Full Schedule</h2>
            {!selectedCategory ? (
              <p className="text-gray-500 text-center py-8">Select a category to view schedule</p>
            ) : !sequence || sequence.length === 0 ? (
              <p className="text-gray-500 text-center py-8">Lottery not conducted yet for this category</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="table-header">
                      <th className="px-4 py-2">#</th>
                      <th className="px-4 py-2">Player</th>
                      <th className="px-4 py-2">Team</th>
                      <th className="px-4 py-2">Status</th>
                      {['admin', 'scorer'].includes(user?.role) && (
                        <th className="px-4 py-2">Actions</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {sequence.map((item) => (
                      <tr key={item.id} className={`${
                        item.performance_status === 'performing' ? 'bg-yellow-50' :
                        item.performance_status === 'completed' ? 'bg-green-50' :
                        ''
                      }`}>
                        <td className="px-4 py-3 font-bold">{item.sequence_number}</td>
                        <td className="px-4 py-3 font-medium">{item.player_name}</td>
                        <td className="px-4 py-3 text-sm text-gray-500">{item.team_name}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 text-xs rounded-full ${
                            item.performance_status === 'completed' ? 'bg-green-100 text-green-700' :
                            item.performance_status === 'performing' ? 'bg-yellow-100 text-yellow-700' :
                            item.performance_status === 'skipped' ? 'bg-gray-100 text-gray-700' :
                            item.performance_status === 'disqualified' ? 'bg-red-100 text-red-700' :
                            'bg-gray-100 text-gray-600'
                          }`}>
                            {item.performance_status}
                          </span>
                        </td>
                        {['admin', 'scorer'].includes(user?.role) && (
                          <td className="px-4 py-3">
                            {item.performance_status === 'pending' && (
                              <button
                                onClick={() => handleStatusChange(item.id, 'performing')}
                                className="text-primary-600 hover:underline text-sm"
                              >
                                Start
                              </button>
                            )}
                            {item.performance_status === 'performing' && (
                              <button
                                onClick={() => handleStatusChange(item.id, 'completed')}
                                className="text-green-600 hover:underline text-sm"
                              >
                                Complete
                              </button>
                            )}
                            {item.performance_status === 'completed' && (
                              <Link
                                to={`/scoring/${getPanelForCategory()?.id || 1}/${item.id}`}
                                className="text-primary-600 hover:underline text-sm flex items-center gap-1"
                              >
                                <FiEdit3 className="w-3 h-3" /> Score
                              </Link>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default PerformanceSchedule
