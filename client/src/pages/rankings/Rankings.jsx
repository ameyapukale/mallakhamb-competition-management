import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import { useAuthStore } from '../../store/authStore'
import { FiAward, FiRefreshCw } from 'react-icons/fi'

const Rankings = () => {
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

  const { data: rankings, isLoading } = useQuery({
    queryKey: ['rankings', competitionId, selectedCategory],
    queryFn: async () => {
      if (!selectedCategory) return null
      const res = await api.get(`/rankings/competition/${competitionId}/category/${selectedCategory}`)
      return res.data.data
    },
    enabled: !!selectedCategory
  })

  const calculateMutation = useMutation({
    mutationFn: () => api.post(`/rankings/calculate/${competitionId}/${selectedCategory}`),
    onSuccess: (response) => {
      toast.success(response.data.message)
      queryClient.invalidateQueries(['rankings', competitionId, selectedCategory])
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || 'Failed to calculate rankings')
    }
  })

  const getRankBadge = (rank) => {
    if (rank === 1) return '🥇'
    if (rank === 2) return '🥈'
    if (rank === 3) return '🥉'
    return rank
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Rankings</h1>
          <p className="text-gray-500">{competition?.competition_name}</p>
        </div>
        <div className="flex gap-2">
          <Link to={`/winners/${competitionId}`} className="btn btn-outline">
            View Winners
          </Link>
          <Link to={`/team-rankings/${competitionId}`} className="btn btn-outline">
            Team Standings
          </Link>
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

        {/* Rankings Table */}
        <div className="lg:col-span-3 card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Standings</h2>
            {user?.role === 'admin' && selectedCategory && (
              <button
                onClick={() => calculateMutation.mutate()}
                disabled={calculateMutation.isPending}
                className="btn btn-outline flex items-center gap-2"
              >
                <FiRefreshCw className={calculateMutation.isPending ? 'animate-spin' : ''} />
                Calculate
              </button>
            )}
          </div>

          {!selectedCategory ? (
            <p className="text-gray-500 text-center py-8">Select a category to view rankings</p>
          ) : isLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
            </div>
          ) : rankings?.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No rankings available yet</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="table-header">
                    <th className="px-4 py-2">Rank</th>
                    <th className="px-4 py-2">Player</th>
                    <th className="px-4 py-2">Team</th>
                    <th className="px-4 py-2">Total Score</th>
                    <th className="px-4 py-2">Average</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rankings?.map((entry, index) => (
                    <tr key={entry.id} className={`${
                      entry.rank_position <= 3 ? 'bg-yellow-50' : ''
                    }`}>
                      <td className="px-4 py-3 text-center text-xl">
                        {getRankBadge(entry.rank_position || index + 1)}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium">{entry.player_name}</p>
                        <p className="text-xs text-gray-500">{entry.registration_number}</p>
                      </td>
                      <td className="px-4 py-3 text-sm">{entry.team_name}</td>
                      <td className="px-4 py-3 font-bold text-primary-600">
                        {entry.total_score?.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {entry.average_score?.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default Rankings
