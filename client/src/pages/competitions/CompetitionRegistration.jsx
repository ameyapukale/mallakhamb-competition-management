import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import { FiArrowLeft, FiPlus, FiTrash2 } from 'react-icons/fi'

const CompetitionRegistration = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [selectedTeam, setSelectedTeam] = useState('')
  const [playerEntries, setPlayerEntries] = useState([])

  const { data: competition } = useQuery({
    queryKey: ['competition', id],
    queryFn: async () => {
      const res = await api.get(`/competitions/${id}`)
      return res.data.data
    }
  })

  const { data: teams } = useQuery({
    queryKey: ['teams'],
    queryFn: async () => {
      const res = await api.get('/teams')
      return res.data.data
    }
  })

  const { data: teamPlayers, refetch: refetchPlayers } = useQuery({
    queryKey: ['team-players', selectedTeam],
    queryFn: async () => {
      const res = await api.get(`/players/team/${selectedTeam}/by-age-group`)
      return res.data.data
    },
    enabled: !!selectedTeam
  })

  const registerMutation = useMutation({
    mutationFn: (data) => api.post('/registrations', data),
    onSuccess: () => {
      toast.success('Team registered successfully!')
      queryClient.invalidateQueries(['competition', id])
      navigate(`/competitions/${id}`)
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || 'Registration failed')
    }
  })

  const handleTeamChange = (teamId) => {
    setSelectedTeam(teamId)
    setPlayerEntries([])
  }

  const addPlayerEntry = (playerId, categoryId) => {
    const exists = playerEntries.find(e => e.player_id === playerId && e.competition_category_id === categoryId)
    if (!exists) {
      setPlayerEntries([...playerEntries, { player_id: parseInt(playerId), competition_category_id: parseInt(categoryId) }])
    }
  }

  const removePlayerEntry = (index) => {
    setPlayerEntries(playerEntries.filter((_, i) => i !== index))
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!selectedTeam) {
      toast.error('Please select a team')
      return
    }
    if (playerEntries.length === 0) {
      toast.error('Please add at least one player entry')
      return
    }

    registerMutation.mutate({
      competition_id: parseInt(id),
      team_id: parseInt(selectedTeam),
      player_entries: playerEntries
    })
  }

  const getPlayerName = (playerId) => {
    for (const [group, players] of Object.entries(teamPlayers || {})) {
      const player = players.find(p => p.id === playerId)
      if (player) return `${player.first_name} ${player.last_name}`
    }
    return 'Unknown'
  }

  const getCategoryName = (categoryId) => {
    const cat = competition?.categories?.find(c => c.id === categoryId)
    return cat ? `${cat.category} - ${cat.age_group_name}` : 'Unknown'
  }

  return (
    <div className="max-w-3xl mx-auto">
      <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6">
        <FiArrowLeft /> Back
      </button>

      <div className="card">
        <h1 className="text-2xl font-bold mb-2">Register for Competition</h1>
        <p className="text-gray-500 mb-6">{competition?.competition_name}</p>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="label">Select Team *</label>
            <select
              value={selectedTeam}
              onChange={(e) => handleTeamChange(e.target.value)}
              className="input"
              required
            >
              <option value="">Select your team</option>
              {teams?.map((team) => (
                <option key={team.id} value={team.id}>{team.team_name}</option>
              ))}
            </select>
          </div>

          {selectedTeam && (
            <>
              <div className="border-t pt-6">
                <h2 className="text-lg font-semibold mb-4">Add Players to Categories</h2>
                
                {Object.keys(teamPlayers || {}).length === 0 ? (
                  <p className="text-gray-500">No players found in this team. Please add players first.</p>
                ) : (
                  Object.entries(teamPlayers || {}).map(([ageGroup, players]) => (
                    <div key={ageGroup} className="mb-4">
                      <h3 className="font-medium text-primary-600 mb-2">{ageGroup}</h3>
                      <div className="space-y-2">
                        {players.map((player) => {
                          const matchingCategories = competition?.categories?.filter(
                            c => c.category === player.category && c.age_group_id === player.age_group_id
                          ) || []
                          
                          return (
                          <div key={player.id} className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                            <span className="flex-1">
                              {player.first_name} {player.last_name}
                              <span className={`ml-2 px-2 py-0.5 text-xs rounded ${
                                player.category === 'pole' ? 'bg-blue-100 text-blue-700' :
                                player.category === 'rope' ? 'bg-green-100 text-green-700' :
                                'bg-purple-100 text-purple-700'
                              }`}>
                                {player.category}
                              </span>
                            </span>
                            {matchingCategories.length > 0 ? (
                              <select
                                className="input py-1 w-48"
                                onChange={(e) => {
                                  if (e.target.value) {
                                    addPlayerEntry(player.id, e.target.value)
                                    e.target.value = ''
                                  }
                                }}
                              >
                                <option value="">Add to category...</option>
                                {matchingCategories.map((cat) => (
                                  <option key={cat.id} value={cat.id}>
                                    {cat.category} - {cat.age_group_name}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <span className="text-xs text-gray-400">No matching category</span>
                            )}
                          </div>
                          )
                        })}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Selected Entries */}
              {playerEntries.length > 0 && (
                <div className="border-t pt-6">
                  <h2 className="text-lg font-semibold mb-4">Selected Entries ({playerEntries.length})</h2>
                  <div className="space-y-2">
                    {playerEntries.map((entry, index) => (
                      <div key={index} className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                        <span>
                          <span className="font-medium">{getPlayerName(entry.player_id)}</span>
                          <span className="text-gray-500 ml-2">→ {getCategoryName(entry.competition_category_id)}</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => removePlayerEntry(index)}
                          className="p-1 text-red-500 hover:bg-red-50 rounded"
                        >
                          <FiTrash2 />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <p className="text-sm text-yellow-800">
                  <strong>Entry Fee:</strong> ₹{competition?.entry_fee || 0} per team
                </p>
              </div>
            </>
          )}

          <div className="flex justify-end gap-4 pt-4">
            <button type="button" onClick={() => navigate(-1)} className="btn btn-outline">
              Cancel
            </button>
            <button 
              type="submit" 
              className="btn btn-primary" 
              disabled={!selectedTeam || playerEntries.length === 0 || registerMutation.isPending}
            >
              {registerMutation.isPending ? 'Registering...' : 'Register Team'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default CompetitionRegistration
