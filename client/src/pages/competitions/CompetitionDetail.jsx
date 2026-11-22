import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, Link } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import { useAuthStore } from '../../store/authStore'
import {
  FiCalendar, FiMapPin, FiUsers, FiAward, FiEdit, FiShuffle, FiBarChart2,
  FiChevronRight, FiChevronDown, FiAlertTriangle, FiUserPlus, FiUserCheck, FiClipboard
} from 'react-icons/fi'
import JudgeRegisterButton from '../../components/JudgeRegisterButton'

const CompetitionDetail = () => {
  const { id } = useParams()
  const { user } = useAuthStore()
  const queryClient = useQueryClient()

  const { data: competition, isLoading } = useQuery({
    queryKey: ['competition', id],
    queryFn: async () => {
      const res = await api.get(`/competitions/${id}`)
      return res.data.data
    }
  })

  const updateStatusMutation = useMutation({
    mutationFn: ({ status }) => api.patch(`/competitions/${id}/status`, { status }),
    onSuccess: () => {
      toast.success('Status updated successfully')
      queryClient.invalidateQueries(['competition', id])
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || 'Failed to update status')
    }
  })

  if (isLoading) {
    return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div></div>
  }

  if (!competition) {
    return <div className="card text-center py-12">Competition not found</div>
  }

  const getStatusColor = (status) => {
    const colors = {
      draft: 'bg-gray-100 text-gray-700',
      registration_open: 'bg-green-100 text-green-700',
      registration_closed: 'bg-yellow-100 text-yellow-700',
      ongoing: 'bg-blue-100 text-blue-700',
      completed: 'bg-purple-100 text-purple-700',
      cancelled: 'bg-red-100 text-red-700'
    }
    return colors[status] || 'bg-gray-100 text-gray-700'
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-2xl font-bold">{competition.competition_name}</h1>
            <span className={`px-3 py-1 text-sm rounded-full ${getStatusColor(competition.status)}`}>
              {competition.status?.replace('_', ' ')}
            </span>
          </div>
          <p className="text-gray-500">Code: {competition.competition_code}</p>
        </div>
        
        <div className="flex gap-2 flex-wrap items-center">
          {user?.role === 'admin' && (
            <Link to={`/competitions/${id}/edit`} className="btn btn-outline flex items-center gap-2">
              <FiEdit /> Edit
            </Link>
          )}
          {user?.role === 'team_manager' && competition.status === 'registration_open' && (
            <Link to={`/competitions/${id}/register`} className="btn btn-primary">
              Register Team
            </Link>
          )}
          {/* Judges and scorers register themselves, the counterpart to Register Team */}
          <JudgeRegisterButton competitionId={id} />
          {user?.role === 'admin' && (
            <>
              <Link to={`/lottery/${id}`} className="btn btn-outline flex items-center gap-2">
                <FiShuffle /> Lottery
              </Link>
              <Link to={`/rankings/${id}`} className="btn btn-outline flex items-center gap-2">
                <FiBarChart2 /> Rankings
              </Link>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Info */}
        <div className="lg:col-span-2 space-y-6">
          <div className="card">
            <h2 className="text-lg font-semibold mb-4">Competition Details</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center gap-3">
                <FiCalendar className="text-gray-400" />
                <div>
                  <p className="text-sm text-gray-500">Event Dates</p>
                  <p className="font-medium">
                    {new Date(competition.start_date).toLocaleDateString()} - {new Date(competition.end_date).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <FiMapPin className="text-gray-400" />
                <div>
                  <p className="text-sm text-gray-500">Venue</p>
                  <p className="font-medium">{competition.venue || 'TBA'}</p>
                  <p className="text-sm text-gray-500">{competition.city}, {competition.state}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <FiUsers className="text-gray-400" />
                <div>
                  <p className="text-sm text-gray-500">Teams Registered</p>
                  <p className="font-medium">{competition.registered_teams_count || 0} / {competition.max_teams || '∞'}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <FiAward className="text-gray-400" />
                <div>
                  <p className="text-sm text-gray-500">Prize Pool</p>
                  <p className="font-medium">₹{competition.prize_pool || 0}</p>
                </div>
              </div>
            </div>
            
            {competition.description && (
              <div className="mt-4 pt-4 border-t">
                <h3 className="font-medium mb-2">Description</h3>
                <p className="text-gray-600">{competition.description}</p>
              </div>
            )}
          </div>

          {/* Categories */}
          <div className="card">
            <h2 className="text-lg font-semibold mb-4">Categories</h2>
            {competition.categories?.length === 0 ? (
              <p className="text-gray-500">No categories added yet</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {competition.categories?.map((cat) => (
                  <div key={cat.id} className="p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center justify-between">
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        cat.category === 'pole' ? 'bg-blue-100 text-blue-700' :
                        cat.category === 'rope' ? 'bg-green-100 text-green-700' :
                        'bg-purple-100 text-purple-700'
                      }`}>
                        {cat.category}
                      </span>
                      <span className="text-sm text-gray-500">{cat.entry_count || 0} entries</span>
                    </div>
                    <p className="font-medium mt-2">{cat.age_group_name}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Registered Teams, each expanding to its squad.
              The server decides per team whether this user may edit it. */}
          <RegisteredTeams competitionId={id} />

          {/* Registered Judges sits alongside the teams, the other half of who
              is taking part. Admin only, as the roster of officials. */}
          {user?.role === 'admin' && <RegisteredJudgesSection competitionId={id} />}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Registration Info */}
          <div className="card">
            <h3 className="font-semibold mb-3">Registration</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Start Date</span>
                <span>{new Date(competition.registration_start_date).toLocaleDateString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">End Date</span>
                <span>{new Date(competition.registration_end_date).toLocaleDateString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Entry Fee</span>
                <span>₹{competition.entry_fee || 0}</span>
              </div>
            </div>
          </div>

          {/* Organizer */}
          <div className="card">
            <h3 className="font-semibold mb-3">Organizer</h3>
            <p className="font-medium">{competition.organizer_name || 'N/A'}</p>
            {competition.organizer_contact && (
              <p className="text-sm text-gray-500">{competition.organizer_contact}</p>
            )}
          </div>

          {/* Admin Actions */}
          {user?.role === 'admin' && (
            <div className="card">
              <h3 className="font-semibold mb-3">Admin Actions</h3>
              <div className="space-y-2">
                <select
                  className="input"
                  value={competition.status}
                  onChange={(e) => updateStatusMutation.mutate({ status: e.target.value })}
                >
                  <option value="draft">Draft</option>
                  <option value="registration_open">Open Registration</option>
                  <option value="registration_closed">Close Registration</option>
                  <option value="ongoing">Start Competition</option>
                  <option value="completed">Complete</option>
                  <option value="cancelled">Cancel</option>
                </select>
                <Link to={`/schedule/${id}`} className="btn btn-outline w-full">
                  View Schedule
                </Link>
              </div>
            </div>
          )}

          {/* Quick Links */}
          <div className="card">
            <h3 className="font-semibold mb-3">Quick Links</h3>
            <div className="space-y-2">
              <Link to={`/schedule/${id}`} className="block text-primary-600 hover:underline">
                Performance Schedule
              </Link>
              <Link to={`/rankings/${id}`} className="block text-primary-600 hover:underline">
                View Rankings
              </Link>
              <Link to={`/winners/${id}`} className="block text-primary-600 hover:underline">
                Winners List
              </Link>
              <Link to={`/team-rankings/${id}`} className="block text-primary-600 hover:underline">
                Team Standings
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Registered teams, each collapsed to a summary with its player count and
 * expandable to the full squad — age group, category and an edit link per player.
 */
const RegisteredTeams = ({ competitionId }) => {
  const [openTeamId, setOpenTeamId] = useState(null)

  const { data: teams, isLoading } = useQuery({
    queryKey: ['competition-teams', competitionId],
    queryFn: async () => {
      const res = await api.get(`/competitions/${competitionId}/teams`)
      return res.data.data
    }
  })

  const statusBadge = (status) => ({
    approved: 'bg-green-100 text-green-700',
    pending: 'bg-yellow-100 text-yellow-700',
    rejected: 'bg-red-100 text-red-700'
  }[status] || 'bg-gray-100 text-gray-700')

  if (isLoading) {
    return (
      <div className="card flex justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  return (
    <div className="card">
      <h2 className="text-lg font-semibold mb-4">Registered Teams</h2>

      {!teams?.length ? (
        <p className="text-gray-500">No teams registered yet</p>
      ) : (
        <div className="space-y-3">
          {teams.map((team) => {
            const isOpen = openTeamId === team.team_id
            return (
              <div key={team.registration_id} className="border rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => setOpenTeamId(isOpen ? null : team.team_id)}
                  className="w-full flex items-center justify-between gap-3 p-3 bg-gray-50 hover:bg-gray-100 text-left"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {isOpen ? <FiChevronDown className="w-4 h-4 shrink-0" /> : <FiChevronRight className="w-4 h-4 shrink-0" />}
                    <div className="min-w-0">
                      <p className="font-medium truncate">{team.team_name}</p>
                      <p className="text-sm text-gray-500">
                        {team.player_count} player{team.player_count === 1 ? '' : 's'}
                        {team.entered_count > 0 && ` · ${team.entered_count} entered`}
                        {' · '}Registered {new Date(team.registration_date).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {team.mismatch_count > 0 && (
                      <span className="px-2 py-1 text-xs rounded-full bg-red-100 text-red-700">
                        {team.mismatch_count} age group issue{team.mismatch_count === 1 ? '' : 's'}
                      </span>
                    )}
                    {team.can_edit ? (
                      <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-700">Your team</span>
                    ) : (
                      <span className="px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-500">Read only</span>
                    )}
                    <span className={`px-2 py-1 text-xs rounded-full ${statusBadge(team.registration_status)}`}>
                      {team.registration_status}
                    </span>
                  </div>
                </button>

                {isOpen && (
                  <div className="p-3">
                    {team.players.length === 0 ? (
                      <p className="text-sm text-gray-500 py-2">This team has no players yet.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="table-header">
                              <th className="px-3 py-2 text-left">Player</th>
                              <th className="px-3 py-2 text-left">Age Group</th>
                              <th className="px-3 py-2 text-left">Category</th>
                              <th className="px-3 py-2 text-left">Gender</th>
                              <th className="px-3 py-2 text-left">Entered</th>
                              {team.can_edit && <th className="px-3 py-2"></th>}
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {team.players.map((player) => (
                              <tr key={player.id} className="hover:bg-gray-50">
                                <td className="px-3 py-2">
                                  <p className="font-medium">{player.player_name}</p>
                                  {player.registration_number && (
                                    <p className="text-xs text-gray-400">{player.registration_number}</p>
                                  )}
                                </td>
                                <td className="px-3 py-2">
                                  <span className={player.gender_mismatch ? 'text-red-600 font-medium' : ''}>
                                    {player.age_group_name?.trim() || '—'}
                                  </span>
                                  {player.gender_mismatch && (
                                    <p className="text-xs text-red-600 flex items-center gap-1">
                                      <FiAlertTriangle className="w-3 h-3" />
                                      {player.gender} player in a {player.age_group_gender} group
                                    </p>
                                  )}
                                </td>
                                <td className="px-3 py-2 capitalize">{player.category}</td>
                                <td className="px-3 py-2 capitalize">{player.gender}</td>
                                <td className="px-3 py-2">
                                  {player.is_entered ? (
                                    <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-700">Yes</span>
                                  ) : (
                                    <span className="text-xs text-gray-400">No</span>
                                  )}
                                </td>
                                {team.can_edit && (
                                  <td className="px-3 py-2 text-right">
                                    <Link
                                      to={`/players/${player.id}/edit`}
                                      className="inline-flex items-center gap-1 text-primary-600 hover:underline"
                                    >
                                      <FiEdit className="w-3 h-3" /> Edit
                                    </Link>
                                  </td>
                                )}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/**
 * The judges and scorers who have registered for this competition, with the panel
 * slots they hold. Mirrors the standalone Registered Judges page, scoped to here.
 */
const RegisteredJudgesSection = ({ competitionId }) => {
  const { data: judges, isLoading } = useQuery({
    queryKey: ['competition-judges', competitionId],
    queryFn: async () => {
      const res = await api.get(`/competitions/${competitionId}/judges`)
      return res.data.data
    }
  })

  const roleBadge = (role) =>
    role === 'judge' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'

  if (isLoading) {
    return (
      <div className="card flex justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  const assignedCount = judges?.filter((j) => j.assignments.length > 0).length || 0

  return (
    <div className="card">
      <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold">Registered Judges</h2>
          <p className="text-sm text-gray-500">
            {judges?.length
              ? `${judges.length} registered · ${assignedCount} on a panel`
              : 'Judges register themselves for this competition'}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link
            to={`/admin/register-judge?competition=${competitionId}`}
            className="btn btn-outline text-sm py-1 px-3 flex items-center gap-1"
          >
            <FiUserPlus className="w-3 h-3" /> Register Judge
          </Link>
          <Link to="/panels/create" className="btn btn-outline text-sm py-1 px-3 flex items-center gap-1">
            <FiClipboard className="w-3 h-3" /> Create Panel
          </Link>
        </div>
      </div>

      {!judges?.length ? (
        <div className="text-center py-8">
          <FiUserCheck className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 mb-4">No judges have registered for this competition yet.</p>
          <Link
            to={`/admin/register-judge?competition=${competitionId}`}
            className="btn btn-primary inline-flex items-center gap-2"
          >
            <FiUserPlus className="w-4 h-4" /> Register Judge
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="table-header">
                <th className="px-3 py-2 text-left">Judge</th>
                <th className="px-3 py-2 text-left">Role</th>
                <th className="px-3 py-2 text-left">Registered</th>
                <th className="px-3 py-2 text-left">Panel Assignments</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {judges.map((judge) => (
                <tr key={judge.registration_id} className="hover:bg-gray-50">
                  <td className="px-3 py-2">
                    <p className="font-medium">{judge.full_name}</p>
                    <p className="text-xs text-gray-400">{judge.username} · {judge.email}</p>
                  </td>
                  <td className="px-3 py-2">
                    <span className={`px-2 py-1 text-xs rounded-full ${roleBadge(judge.role)}`}>
                      {judge.role?.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-gray-500">
                    {new Date(judge.registered_at).toLocaleDateString()}
                  </td>
                  <td className="px-3 py-2">
                    {judge.assignments.length === 0 ? (
                      <span className="text-xs text-gray-400 italic">Not assigned</span>
                    ) : (
                      <div className="space-y-1">
                        {judge.assignments.map((a) => (
                          <Link
                            key={`${a.panel_id}-${a.position}`}
                            to={`/panels/${a.panel_id}`}
                            className="block text-primary-600 hover:underline"
                          >
                            {a.panel_name}
                          </Link>
                        ))}
                      </div>
                    )}
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

export default CompetitionDetail
