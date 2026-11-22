import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import api from '../../services/api'
import { FiPlus, FiUsers, FiMapPin, FiArrowRight, FiEdit } from 'react-icons/fi'

const Teams = () => {
  const { data: teams, isLoading } = useQuery({
    queryKey: ['teams'],
    queryFn: async () => {
      const res = await api.get('/teams')
      return res.data.data
    }
  })

  if (isLoading) {
    return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div></div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Teams</h1>
          <p className="text-gray-500">Manage your teams and players</p>
        </div>
        <Link to="/teams/create" className="btn btn-primary flex items-center gap-2">
          <FiPlus /> Create Team
        </Link>
      </div>

      {teams?.length === 0 ? (
        <div className="card text-center py-12">
          <FiUsers className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No teams yet</h3>
          <p className="text-gray-500 mb-4">Create your first team to start registering for competitions</p>
          <Link to="/teams/create" className="btn btn-primary">Create Team</Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {teams?.map((team) => (
            // A div rather than a Link so the Edit action can sit inside the card
            // without a click also navigating to the detail page.
            <div key={team.id} className="card hover:shadow-lg transition-shadow flex flex-col">
              <Link to={`/teams/${team.id}`} className="block">
              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 bg-primary-100 rounded-lg flex items-center justify-center">
                  <span className="text-xl font-bold text-primary-600">
                    {team.team_name?.charAt(0)?.toUpperCase()}
                  </span>
                </div>
                <span className={`px-2 py-1 text-xs rounded-full ${team.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>
                  {team.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
              <h3 className="font-semibold text-lg mb-1">{team.team_name}</h3>
              <p className="text-sm text-gray-500 mb-3">{team.team_code}</p>
              <div className="flex items-center gap-4 text-sm text-gray-500">
                <span className="flex items-center gap-1">
                  <FiUsers className="w-4 h-4" />
                  {team.player_count || 0} players
                </span>
                {team.city && (
                  <span className="flex items-center gap-1">
                    <FiMapPin className="w-4 h-4" />
                    {team.city}
                  </span>
                )}
              </div>
              <div className="mt-4 pt-4 border-t flex items-center justify-between">
                <span className="text-sm text-gray-500">Manager: {team.manager_name || 'N/A'}</span>
                <FiArrowRight className="text-primary-600" />
              </div>
              </Link>

              <div className="mt-3">
                <Link
                  to={`/teams/${team.id}/edit`}
                  className="btn btn-outline text-sm py-1 px-3 inline-flex items-center gap-1"
                >
                  <FiEdit className="w-3 h-3" /> Edit
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default Teams
