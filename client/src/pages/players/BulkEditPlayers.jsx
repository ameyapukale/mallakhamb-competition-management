import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import { FiArrowLeft, FiSave, FiX, FiCheck } from 'react-icons/fi'

const BulkEditPlayers = () => {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()
  const teamFilter = searchParams.get('team') || ''
  
  const [selectedTeam, setSelectedTeam] = useState(teamFilter)
  const [editedPlayers, setEditedPlayers] = useState({})
  const [selectedIds, setSelectedIds] = useState([])

  const { data: teams } = useQuery({
    queryKey: ['teams'],
    queryFn: async () => {
      const res = await api.get('/teams')
      return res.data.data
    }
  })

  const { data: players, isLoading } = useQuery({
    queryKey: ['players', { team_id: selectedTeam }],
    queryFn: async () => {
      const params = selectedTeam ? { team_id: selectedTeam } : {}
      const res = await api.get('/players', { params })
      return res.data.data
    },
    enabled: !!selectedTeam
  })

  const bulkUpdateMutation = useMutation({
    mutationFn: (data) => api.put('/players/bulk', data),
    onSuccess: (response) => {
      toast.success(response.data.message || 'Players updated successfully!')
      queryClient.invalidateQueries(['players'])
      setEditedPlayers({})
      setSelectedIds([])
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || 'Failed to update players')
    }
  })

  const handleFieldChange = (playerId, field, value) => {
    setEditedPlayers(prev => ({
      ...prev,
      [playerId]: {
        ...prev[playerId],
        id: playerId,
        [field]: value
      }
    }))
  }

  const toggleSelect = (playerId) => {
    setSelectedIds(prev => 
      prev.includes(playerId) 
        ? prev.filter(id => id !== playerId)
        : [...prev, playerId]
    )
  }

  const toggleSelectAll = () => {
    if (selectedIds.length === players?.length) {
      setSelectedIds([])
    } else {
      setSelectedIds(players?.map(p => p.id) || [])
    }
  }

  const applyBulkChange = (field, value) => {
    if (!value) return
    
    const updates = {}
    selectedIds.forEach(id => {
      updates[id] = {
        ...editedPlayers[id],
        id,
        [field]: value
      }
    })
    setEditedPlayers(prev => ({ ...prev, ...updates }))
  }

  const handleSave = () => {
    const playersToUpdate = Object.values(editedPlayers).filter(p => Object.keys(p).length > 1)
    
    if (playersToUpdate.length === 0) {
      toast.error('No changes to save')
      return
    }

    bulkUpdateMutation.mutate({ players: playersToUpdate })
  }

  const getEditedValue = (playerId, field, originalValue) => {
    return editedPlayers[playerId]?.[field] ?? originalValue
  }

  const isEdited = (playerId) => {
    return editedPlayers[playerId] && Object.keys(editedPlayers[playerId]).length > 1
  }

  const clearEdits = (playerId) => {
    setEditedPlayers(prev => {
      const newState = { ...prev }
      delete newState[playerId]
      return newState
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-gray-600 hover:text-gray-900">
            <FiArrowLeft /> Back
          </button>
          <div>
            <h1 className="text-2xl font-bold">Bulk Edit Players</h1>
            <p className="text-gray-500">Edit multiple players at once</p>
          </div>
        </div>
        <button 
          onClick={handleSave}
          disabled={Object.keys(editedPlayers).length === 0 || bulkUpdateMutation.isPending}
          className="btn btn-primary flex items-center gap-2"
        >
          <FiSave /> {bulkUpdateMutation.isPending ? 'Saving...' : 'Save All Changes'}
        </button>
      </div>

      {/* Team Selection */}
      <div className="card">
        <div className="flex items-center gap-4">
          <label className="font-medium">Select Team:</label>
          <select
            value={selectedTeam}
            onChange={(e) => {
              setSelectedTeam(e.target.value)
              setEditedPlayers({})
              setSelectedIds([])
            }}
            className="input w-64"
          >
            <option value="">Select a team</option>
            {teams?.map((team) => (
              <option key={team.id} value={team.id}>{team.team_name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Bulk Actions */}
      {selectedIds.length > 0 && (
        <div className="card bg-blue-50 border-blue-200">
          <div className="flex items-center gap-4 flex-wrap">
            <span className="font-medium text-blue-700">{selectedIds.length} selected</span>
            <div className="flex items-center gap-2">
              <label className="text-sm">Category:</label>
              <select 
                className="input py-1 w-32"
                onChange={(e) => applyBulkChange('category', e.target.value)}
                defaultValue=""
              >
                <option value="">Apply...</option>
                <option value="pole">Pole</option>
                <option value="rope">Rope</option>
                <option value="hanging">Hanging</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm">Gender:</label>
              <select 
                className="input py-1 w-32"
                onChange={(e) => applyBulkChange('gender', e.target.value)}
                defaultValue=""
              >
                <option value="">Apply...</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm">Experience:</label>
              <input 
                type="number" 
                className="input py-1 w-20"
                placeholder="Years"
                onBlur={(e) => applyBulkChange('experience_years', e.target.value ? parseInt(e.target.value) : null)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Players Table */}
      {!selectedTeam ? (
        <div className="card text-center py-12">
          <p className="text-gray-500">Please select a team to edit players</p>
        </div>
      ) : isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      ) : players?.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-gray-500">No players found in this team</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="table-header">
                  <th className="px-4 py-3 w-12">
                    <input
                      type="checkbox"
                      checked={selectedIds.length === players?.length}
                      onChange={toggleSelectAll}
                      className="rounded border-gray-300"
                    />
                  </th>
                  <th className="px-4 py-3">First Name</th>
                  <th className="px-4 py-3">Last Name</th>
                  <th className="px-4 py-3">DOB</th>
                  <th className="px-4 py-3">Gender</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Height (cm)</th>
                  <th className="px-4 py-3">Weight (kg)</th>
                  <th className="px-4 py-3">Experience</th>
                  <th className="px-4 py-3 w-20">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {players?.map((player) => (
                  <tr key={player.id} className={`${isEdited(player.id) ? 'bg-yellow-50' : 'hover:bg-gray-50'}`}>
                    <td className="px-4 py-2">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(player.id)}
                        onChange={() => toggleSelect(player.id)}
                        className="rounded border-gray-300"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="text"
                        value={getEditedValue(player.id, 'first_name', player.first_name)}
                        onChange={(e) => handleFieldChange(player.id, 'first_name', e.target.value)}
                        className="input py-1 w-full"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="text"
                        value={getEditedValue(player.id, 'last_name', player.last_name)}
                        onChange={(e) => handleFieldChange(player.id, 'last_name', e.target.value)}
                        className="input py-1 w-full"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="date"
                        value={getEditedValue(player.id, 'date_of_birth', player.date_of_birth?.split('T')[0])}
                        onChange={(e) => handleFieldChange(player.id, 'date_of_birth', e.target.value)}
                        className="input py-1"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <select
                        value={getEditedValue(player.id, 'gender', player.gender)}
                        onChange={(e) => handleFieldChange(player.id, 'gender', e.target.value)}
                        className="input py-1"
                      >
                        <option value="male">Male</option>
                        <option value="female">Female</option>
                        <option value="other">Other</option>
                      </select>
                    </td>
                    <td className="px-4 py-2">
                      <select
                        value={getEditedValue(player.id, 'category', player.category)}
                        onChange={(e) => handleFieldChange(player.id, 'category', e.target.value)}
                        className="input py-1"
                      >
                        <option value="pole">Pole</option>
                        <option value="rope">Rope</option>
                        <option value="hanging">Hanging</option>
                      </select>
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="number"
                        step="0.1"
                        value={getEditedValue(player.id, 'height_cm', player.height_cm || '')}
                        onChange={(e) => handleFieldChange(player.id, 'height_cm', e.target.value)}
                        className="input py-1 w-20"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="number"
                        step="0.1"
                        value={getEditedValue(player.id, 'weight_kg', player.weight_kg || '')}
                        onChange={(e) => handleFieldChange(player.id, 'weight_kg', e.target.value)}
                        className="input py-1 w-20"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="number"
                        value={getEditedValue(player.id, 'experience_years', player.experience_years || '')}
                        onChange={(e) => handleFieldChange(player.id, 'experience_years', e.target.value)}
                        className="input py-1 w-16"
                      />
                    </td>
                    <td className="px-4 py-2">
                      {isEdited(player.id) ? (
                        <div className="flex items-center gap-1">
                          <span className="text-yellow-600 text-xs">Modified</span>
                          <button
                            onClick={() => clearEdits(player.id)}
                            className="p-1 text-gray-400 hover:text-red-500"
                            title="Undo changes"
                          >
                            <FiX size={14} />
                          </button>
                        </div>
                      ) : (
                        <span className="text-green-600 text-xs flex items-center gap-1">
                          <FiCheck size={14} /> Saved
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="card bg-gray-50">
        <h3 className="font-medium mb-2">Tips:</h3>
        <ul className="text-sm text-gray-600 space-y-1">
          <li>• Select multiple players using checkboxes to apply bulk changes</li>
          <li>• Edit individual cells directly in the table</li>
          <li>• Yellow rows indicate unsaved changes</li>
          <li>• Click "Save All Changes" to save all modifications at once</li>
        </ul>
      </div>
    </div>
  )
}

export default BulkEditPlayers
