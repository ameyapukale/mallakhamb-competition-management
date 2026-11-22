import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import { FiArrowLeft, FiPlus, FiTrash2 } from 'react-icons/fi'

const BulkAddPlayers = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [selectedTeam, setSelectedTeam] = useState(searchParams.get('team') || '')
  const [players, setPlayers] = useState([{
    first_name: '',
    last_name: '',
    date_of_birth: '',
    gender: '',
    category: '',
    experience_years: 0
  }])

  const { data: teams } = useQuery({
    queryKey: ['teams'],
    queryFn: async () => {
      const res = await api.get('/teams')
      return res.data.data
    }
  })

  const bulkAddMutation = useMutation({
    mutationFn: (data) => api.post('/players/bulk', data),
    onSuccess: (response) => {
      toast.success(`${response.data.data.length} players added successfully!`)
      navigate(`/teams/${selectedTeam}`)
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || 'Failed to add players')
    }
  })

  const addRow = () => {
    setPlayers([...players, {
      first_name: '',
      last_name: '',
      date_of_birth: '',
      gender: '',
      category: '',
      experience_years: 0
    }])
  }

  const removeRow = (index) => {
    setPlayers(players.filter((_, i) => i !== index))
  }

  const updatePlayer = (index, field, value) => {
    const updated = [...players]
    updated[index][field] = value
    setPlayers(updated)
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    
    if (!selectedTeam) {
      toast.error('Please select a team')
      return
    }

    const validPlayers = players.filter(p => p.first_name && p.last_name && p.date_of_birth && p.gender && p.category)
    
    if (validPlayers.length === 0) {
      toast.error('Please fill in at least one complete player entry')
      return
    }

    bulkAddMutation.mutate({
      team_id: parseInt(selectedTeam),
      players: validPlayers
    })
  }

  return (
    <div className="space-y-6">
      <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-gray-600 hover:text-gray-900">
        <FiArrowLeft /> Back
      </button>

      <div className="card">
        <h1 className="text-2xl font-bold mb-6">Bulk Add Players</h1>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="max-w-md">
            <label className="label">Select Team *</label>
            <select
              value={selectedTeam}
              onChange={(e) => setSelectedTeam(e.target.value)}
              className="input"
              required
            >
              <option value="">Select team</option>
              {teams?.map((team) => (
                <option key={team.id} value={team.id}>{team.team_name}</option>
              ))}
            </select>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px]">
              <thead>
                <tr className="table-header">
                  <th className="px-2 py-2">First Name *</th>
                  <th className="px-2 py-2">Last Name *</th>
                  <th className="px-2 py-2">DOB *</th>
                  <th className="px-2 py-2">Gender *</th>
                  <th className="px-2 py-2">Category *</th>
                  <th className="px-2 py-2">Exp (yrs)</th>
                  <th className="px-2 py-2 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {players.map((player, index) => (
                  <tr key={index} className="border-b">
                    <td className="p-2">
                      <input
                        type="text"
                        value={player.first_name}
                        onChange={(e) => updatePlayer(index, 'first_name', e.target.value)}
                        className="input py-1"
                        placeholder="First name"
                      />
                    </td>
                    <td className="p-2">
                      <input
                        type="text"
                        value={player.last_name}
                        onChange={(e) => updatePlayer(index, 'last_name', e.target.value)}
                        className="input py-1"
                        placeholder="Last name"
                      />
                    </td>
                    <td className="p-2">
                      <input
                        type="date"
                        value={player.date_of_birth}
                        onChange={(e) => updatePlayer(index, 'date_of_birth', e.target.value)}
                        className="input py-1"
                      />
                    </td>
                    <td className="p-2">
                      <select
                        value={player.gender}
                        onChange={(e) => updatePlayer(index, 'gender', e.target.value)}
                        className="input py-1"
                      >
                        <option value="">Select</option>
                        <option value="male">Male</option>
                        <option value="female">Female</option>
                      </select>
                    </td>
                    <td className="p-2">
                      <select
                        value={player.category}
                        onChange={(e) => updatePlayer(index, 'category', e.target.value)}
                        className="input py-1"
                      >
                        <option value="">Select</option>
                        <option value="pole">Pole</option>
                        <option value="rope">Rope</option>
                        <option value="hanging">Hanging</option>
                      </select>
                    </td>
                    <td className="p-2">
                      <input
                        type="number"
                        value={player.experience_years}
                        onChange={(e) => updatePlayer(index, 'experience_years', parseInt(e.target.value) || 0)}
                        className="input py-1 w-20"
                        min="0"
                      />
                    </td>
                    <td className="p-2">
                      {players.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeRow(index)}
                          className="p-1 text-red-500 hover:bg-red-50 rounded"
                        >
                          <FiTrash2 />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            type="button"
            onClick={addRow}
            className="flex items-center gap-2 text-primary-600 hover:underline"
          >
            <FiPlus /> Add Another Row
          </button>

          <div className="flex justify-end gap-4 pt-4">
            <button type="button" onClick={() => navigate(-1)} className="btn btn-outline">
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={bulkAddMutation.isPending}>
              {bulkAddMutation.isPending ? 'Adding...' : `Add ${players.filter(p => p.first_name).length} Players`}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default BulkAddPlayers
