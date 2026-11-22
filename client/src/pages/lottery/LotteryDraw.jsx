import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import { FiShuffle, FiRefreshCw, FiCheck } from 'react-icons/fi'

const LotteryDraw = () => {
  const { competitionId } = useParams()
  const queryClient = useQueryClient()
  const [selectedCategory, setSelectedCategory] = useState('')

  const { data: competition } = useQuery({
    queryKey: ['competition', competitionId],
    queryFn: async () => {
      const res = await api.get(`/competitions/${competitionId}`)
      return res.data.data
    }
  })

  const { data: lotteryDraws, refetch: refetchDraws } = useQuery({
    queryKey: ['lottery-draws', competitionId],
    queryFn: async () => {
      const res = await api.get(`/lottery/competition/${competitionId}`)
      return res.data.data
    }
  })

  const { data: sequence } = useQuery({
    queryKey: ['lottery-sequence', selectedCategory],
    queryFn: async () => {
      const draw = lotteryDraws?.find(d => d.competition_category_id === parseInt(selectedCategory))
      if (!draw) return null
      const res = await api.get(`/lottery/sequence/${draw.id}`)
      return res.data.data
    },
    enabled: !!selectedCategory && !!lotteryDraws
  })

  const conductLotteryMutation = useMutation({
    mutationFn: (data) => api.post('/lottery/conduct', data),
    onSuccess: (response) => {
      toast.success(response.data.message)
      queryClient.invalidateQueries(['lottery-draws', competitionId])
      refetchDraws()
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || 'Failed to conduct lottery')
    }
  })

  const handleConductLottery = (categoryId) => {
    conductLotteryMutation.mutate({
      competition_id: parseInt(competitionId),
      competition_category_id: parseInt(categoryId)
    })
  }

  const getLotteryStatus = (categoryId) => {
    const draw = lotteryDraws?.find(d => d.competition_category_id === categoryId)
    return draw?.status || null
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Lottery Draw</h1>
        <p className="text-gray-500">{competition?.competition_name}</p>
      </div>

      <TeamDraw competitionId={competitionId} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Categories List */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">Categories</h2>
          <div className="space-y-2">
            {competition?.categories?.map((cat) => {
              const status = getLotteryStatus(cat.id)
              return (
                <div 
                  key={cat.id} 
                  className={`p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                    selectedCategory === String(cat.id) 
                      ? 'border-primary-500 bg-primary-50' 
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                  onClick={() => setSelectedCategory(String(cat.id))}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        cat.category === 'pole' ? 'bg-blue-100 text-blue-700' :
                        cat.category === 'rope' ? 'bg-green-100 text-green-700' :
                        'bg-purple-100 text-purple-700'
                      }`}>
                        {cat.category}
                      </span>
                      <p className="font-medium mt-1">{cat.age_group_name}</p>
                    </div>
                    {status === 'completed' ? (
                      <FiCheck className="text-green-500 w-5 h-5" />
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleConductLottery(cat.id)
                        }}
                        disabled={conductLotteryMutation.isPending}
                        className="btn btn-primary text-sm py-1 px-3"
                      >
                        <FiShuffle className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Sequence Display */}
        <div className="lg:col-span-2 card">
          <h2 className="text-lg font-semibold mb-4">Performance Sequence</h2>
          
          {!selectedCategory ? (
            <p className="text-gray-500 text-center py-8">Select a category to view or conduct lottery</p>
          ) : !sequence || sequence.length === 0 ? (
            <div className="text-center py-8">
              <FiShuffle className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 mb-4">Lottery not conducted yet</p>
              <button
                onClick={() => handleConductLottery(selectedCategory)}
                disabled={conductLotteryMutation.isPending}
                className="btn btn-primary"
              >
                {conductLotteryMutation.isPending ? 'Conducting...' : 'Conduct Lottery'}
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {sequence.map((item) => (
                <div 
                  key={item.id} 
                  className={`flex items-center gap-4 p-3 rounded-lg ${
                    item.performance_status === 'completed' ? 'bg-green-50' :
                    item.performance_status === 'performing' ? 'bg-yellow-50 border-2 border-yellow-400' :
                    item.performance_status === 'skipped' ? 'bg-gray-100 opacity-50' :
                    'bg-gray-50'
                  }`}
                >
                  <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center font-bold text-primary-700">
                    {item.sequence_number}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">{item.player_name}</p>
                    <p className="text-sm text-gray-500">{item.team_name}</p>
                  </div>
                  <span className={`px-2 py-1 text-xs rounded-full ${
                    item.performance_status === 'completed' ? 'bg-green-100 text-green-700' :
                    item.performance_status === 'performing' ? 'bg-yellow-100 text-yellow-700' :
                    item.performance_status === 'skipped' ? 'bg-gray-100 text-gray-700' :
                    'bg-gray-100 text-gray-600'
                  }`}>
                    {item.performance_status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Team-level draw: lists every registered team and, on Conduct Lottery,
 * allots them a random performing order.
 */
const TeamDraw = ({ competitionId }) => {
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['team-draw', competitionId],
    queryFn: async () => {
      const res = await api.get(`/lottery/teams/${competitionId}`)
      return res.data.data
    }
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['team-draw', competitionId] })

  const conductMutation = useMutation({
    mutationFn: (redraw) => api.post('/lottery/teams/conduct', {
      competition_id: parseInt(competitionId, 10),
      redraw
    }),
    onSuccess: (res) => { toast.success(res.data.message); invalidate() },
    onError: (error) => toast.error(error.response?.data?.message || 'Failed to conduct lottery')
  })

  const clearMutation = useMutation({
    mutationFn: () => api.delete(`/lottery/teams/${competitionId}`),
    onSuccess: (res) => { toast.success(res.data.message); invalidate() },
    onError: (error) => toast.error(error.response?.data?.message || 'Failed to clear draw')
  })

  if (isLoading) {
    return (
      <div className="card flex justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  const teams = data?.teams || []
  const pending = conductMutation.isPending || clearMutation.isPending

  return (
    <div className="card">
      <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold">Team Draw</h2>
          <p className="text-sm text-gray-500">
            {data?.drawConducted
              ? `Order allotted to ${data.drawnCount} team${data.drawnCount === 1 ? '' : 's'}${
                  data.conductedAt ? ` on ${new Date(data.conductedAt).toLocaleString()}` : ''}`
              : `${teams.length} team${teams.length === 1 ? '' : 's'} registered — no order allotted yet`}
          </p>
        </div>

        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => conductMutation.mutate(data?.drawConducted || false)}
            disabled={pending || teams.length === 0}
            className="btn btn-primary flex items-center gap-2"
          >
            {data?.drawConducted ? <FiRefreshCw className="w-4 h-4" /> : <FiShuffle className="w-4 h-4" />}
            {conductMutation.isPending
              ? 'Drawing...'
              : data?.drawConducted ? 'Re-draw' : 'Conduct Lottery'}
          </button>
          {data?.drawConducted && (
            <button onClick={() => clearMutation.mutate()} disabled={pending} className="btn btn-outline">
              Clear
            </button>
          )}
        </div>
      </div>

      {teams.length === 0 ? (
        <p className="text-gray-500 text-center py-6">
          No teams are registered for this competition yet.
        </p>
      ) : (
        <div className="space-y-2">
          {teams.map((team) => (
            <div
              key={team.registration_id}
              className={`flex items-center gap-4 p-3 rounded-lg ${
                team.draw_order ? 'bg-primary-50 border border-primary-200' : 'bg-gray-50'
              }`}
            >
              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold shrink-0 ${
                team.draw_order
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-200 text-gray-400'
              }`}>
                {team.draw_order ?? '—'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{team.team_name}</p>
                <p className="text-sm text-gray-500">
                  {team.team_code}
                  {team.city ? ` · ${team.city}` : ''}
                  {` · ${team.entry_count} entr${team.entry_count === 1 ? 'y' : 'ies'}`}
                </p>
              </div>
              <span className={`px-2 py-1 text-xs rounded-full whitespace-nowrap ${
                team.registration_status === 'approved' ? 'bg-green-100 text-green-700' :
                team.registration_status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                'bg-gray-100 text-gray-700'
              }`}>
                {team.registration_status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default LotteryDraw
