import { useQuery } from '@tanstack/react-query'
import { useParams, Link } from 'react-router-dom'
import api from '../../services/api'
import { useAuthStore } from '../../store/authStore'
import { FiEdit, FiUserPlus, FiCalendar, FiMail, FiPhone, FiMapPin } from 'react-icons/fi'

const TeamDetail = () => {
  const { id } = useParams()
  const { user } = useAuthStore()

  const { data: team, isLoading } = useQuery({
    queryKey: ['team', id],
    queryFn: async () => {
      const res = await api.get(`/teams/${id}`)
      return res.data.data
    }
  })

  // An admin edits any team; a manager only reaches teams they own, since the
  // teams list already filters to theirs.
  const canManage = ['admin', 'team_manager'].includes(user?.role)

  if (isLoading) {
    return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div></div>
  }

  if (!team) {
    return <div className="card text-center py-12">Team not found</div>
  }

  const groupedPlayers = team.players?.reduce((acc, player) => {
    const group = player.age_group_name || 'Unknown'
    if (!acc[group]) acc[group] = []
    acc[group].push(player)
    return acc
  }, {}) || {}

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{team.team_name}</h1>
          <p className="text-gray-500">Team Code: {team.team_code}</p>
        </div>
        <div className="flex gap-2">
          {canManage && (
            <Link to={`/teams/${id}/edit`} className="btn btn-outline flex items-center gap-2">
              <FiEdit /> Edit Team
            </Link>
          )}
          <Link to={`/players/add?team=${id}`} className="btn btn-primary flex items-center gap-2">
            <FiUserPlus /> Add Player
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Team Info */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">Team Information</h2>
          <div className="space-y-3">
            <div>
              <p className="text-sm text-gray-500">Organization</p>
              <p className="font-medium">{team.organization_name || <span className="text-gray-400 font-normal">Not set</span>}</p>
            </div>

            <div>
              <p className="text-sm text-gray-500">Manager</p>
              <p className="font-medium">{team.manager_name || 'N/A'}</p>
              {team.manager_username && (
                <p className="text-xs text-gray-400">{team.manager_username}</p>
              )}
            </div>

            {/* A team need not carry its own contact details. When it does not, fall
                back to the manager's so the card is never a dead end, and say whose
                they are. */}
            <div className="flex items-start gap-2">
              <FiMail className="text-gray-400 mt-1 shrink-0" />
              {team.contact_email || team.manager_email ? (
                <span>
                  {team.contact_email || team.manager_email}
                  {!team.contact_email && team.manager_email && (
                    <span className="block text-xs text-gray-400">manager's email</span>
                  )}
                </span>
              ) : (
                <span className="text-gray-400">No email on record</span>
              )}
            </div>

            <div className="flex items-start gap-2">
              <FiPhone className="text-gray-400 mt-1 shrink-0" />
              {team.contact_phone || team.manager_phone ? (
                <span>
                  {team.contact_phone || team.manager_phone}
                  {!team.contact_phone && team.manager_phone && (
                    <span className="block text-xs text-gray-400">manager's phone</span>
                  )}
                </span>
              ) : (
                <span className="text-gray-400">No phone on record</span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <FiMapPin className="text-gray-400 shrink-0" />
              {team.city
                ? <span>{team.city}{team.state ? `, ${team.state}` : ''}</span>
                : <span className="text-gray-400">No location on record</span>}
            </div>

            <div className="pt-2 border-t">
              <p className="text-sm text-gray-500">Team Code</p>
              <p className="font-medium">{team.team_code}</p>
            </div>
          </div>
        </div>

        {/* Players by Age Group */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Players ({team.players?.length || 0})</h2>
            <Link to={`/players/bulk-add?team=${id}`} className="text-primary-600 hover:underline text-sm">
              Bulk Add Players
            </Link>
          </div>

          {Object.keys(groupedPlayers).length === 0 ? (
            <div className="card text-center py-8">
              <p className="text-gray-500 mb-4">No players added yet</p>
              <Link to={`/players/add?team=${id}`} className="btn btn-primary">
                Add First Player
              </Link>
            </div>
          ) : (
            Object.entries(groupedPlayers).map(([ageGroup, players]) => (
              <div key={ageGroup} className="card">
                <h3 className="font-semibold text-primary-600 mb-3">{ageGroup}</h3>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="table-header">
                        <th className="px-4 py-2">Name</th>
                        <th className="px-4 py-2">Reg. No</th>
                        <th className="px-4 py-2">Category</th>
                        <th className="px-4 py-2">Gender</th>
                        <th className="px-4 py-2">DOB</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {players.map((player) => (
                        <tr key={player.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium">
                            {player.first_name} {player.last_name}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500">{player.registration_number}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-1 text-xs rounded-full ${
                              player.category === 'pole' ? 'bg-blue-100 text-blue-700' :
                              player.category === 'rope' ? 'bg-green-100 text-green-700' :
                              'bg-purple-100 text-purple-700'
                            }`}>
                              {player.category}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm capitalize">{player.gender}</td>
                          <td className="px-4 py-3 text-sm text-gray-500">
                            {new Date(player.date_of_birth).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

export default TeamDetail
