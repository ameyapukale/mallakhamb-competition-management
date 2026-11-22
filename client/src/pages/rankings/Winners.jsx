import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import api from '../../services/api'
import { FiAward } from 'react-icons/fi'

const Winners = () => {
  const { competitionId } = useParams()

  const { data: competition } = useQuery({
    queryKey: ['competition', competitionId],
    queryFn: async () => {
      const res = await api.get(`/competitions/${competitionId}`)
      return res.data.data
    }
  })

  const { data: winners, isLoading } = useQuery({
    queryKey: ['winners', competitionId],
    queryFn: async () => {
      const res = await api.get(`/rankings/winners/${competitionId}`)
      return res.data.data
    }
  })

  const getMedalEmoji = (status) => {
    if (status === 'gold') return '🥇'
    if (status === 'silver') return '🥈'
    if (status === 'bronze') return '🥉'
    return ''
  }

  if (isLoading) {
    return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div></div>
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold">🏆 Winners</h1>
        <p className="text-gray-500">{competition?.competition_name}</p>
      </div>

      {!winners || Object.keys(winners).length === 0 ? (
        <div className="card text-center py-12">
          <FiAward className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">No winners declared yet</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Object.entries(winners).map(([key, data]) => (
            <div key={key} className="card">
              <div className="mb-4">
                <span className={`px-2 py-1 text-xs rounded-full ${
                  data.category === 'pole' ? 'bg-blue-100 text-blue-700' :
                  data.category === 'rope' ? 'bg-green-100 text-green-700' :
                  'bg-purple-100 text-purple-700'
                }`}>
                  {data.category}
                </span>
                <h3 className="text-lg font-semibold mt-2">{data.age_group}</h3>
              </div>

              <div className="space-y-3">
                {data.winners?.map((winner, index) => (
                  <div 
                    key={index} 
                    className={`p-3 rounded-lg ${
                      winner.rank_status === 'gold' ? 'bg-yellow-50 border-2 border-yellow-400' :
                      winner.rank_status === 'silver' ? 'bg-gray-100 border-2 border-gray-400' :
                      'bg-orange-50 border-2 border-orange-400'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{getMedalEmoji(winner.rank_status)}</span>
                      <div>
                        <p className="font-semibold">{winner.player_name}</p>
                        <p className="text-sm text-gray-500">{winner.team_name}</p>
                        <p className="text-xs text-primary-600 font-medium">
                          Score: {winner.total_score?.toFixed(2)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default Winners
