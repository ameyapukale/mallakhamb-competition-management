import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import api from '../../services/api'

const TeamRankings = () => {
  const { competitionId } = useParams()

  const { data: competition } = useQuery({
    queryKey: ['competition', competitionId],
    queryFn: async () => {
      const res = await api.get(`/competitions/${competitionId}`)
      return res.data.data
    }
  })

  const { data: teamRankings, isLoading } = useQuery({
    queryKey: ['team-rankings', competitionId],
    queryFn: async () => {
      const res = await api.get(`/rankings/teams/${competitionId}`)
      return res.data.data
    }
  })

  if (isLoading) {
    return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div></div>
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold">🏅 Team Standings</h1>
        <p className="text-gray-500">{competition?.competition_name}</p>
      </div>

      {!teamRankings || teamRankings.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-gray-500">No team rankings available yet</p>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="table-header">
                <th className="px-4 py-3">Rank</th>
                <th className="px-4 py-3">Team</th>
                <th className="px-4 py-3 text-center">🥇</th>
                <th className="px-4 py-3 text-center">🥈</th>
                <th className="px-4 py-3 text-center">🥉</th>
                <th className="px-4 py-3 text-center">Participants</th>
                <th className="px-4 py-3 text-center">Total Score</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {teamRankings?.map((team, index) => (
                <tr key={team.team_id} className={index < 3 ? 'bg-yellow-50' : ''}>
                  <td className="px-4 py-4 text-center font-bold text-xl">
                    {index === 0 ? '🏆' : index + 1}
                  </td>
                  <td className="px-4 py-4">
                    <p className="font-semibold">{team.team_name}</p>
                    <p className="text-xs text-gray-500">{team.team_code}</p>
                  </td>
                  <td className="px-4 py-4 text-center font-bold text-yellow-600">
                    {team.gold_count || 0}
                  </td>
                  <td className="px-4 py-4 text-center font-bold text-gray-500">
                    {team.silver_count || 0}
                  </td>
                  <td className="px-4 py-4 text-center font-bold text-orange-600">
                    {team.bronze_count || 0}
                  </td>
                  <td className="px-4 py-4 text-center">
                    {team.total_participants || 0}
                  </td>
                  <td className="px-4 py-4 text-center font-bold text-primary-600">
                    {team.total_team_score?.toFixed(2) || 0}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default TeamRankings
