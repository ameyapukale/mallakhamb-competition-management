import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import api from '../../services/api'
import { FiPlus, FiFilter, FiEdit2, FiEdit } from 'react-icons/fi'
import { useState } from 'react'

const Players = () => {
  const [searchParams] = useSearchParams()
  const [filters, setFilters] = useState({
    team_id: searchParams.get('team') || '',
    age_group_id: '',
    category: '',
    gender: ''
  })

  const { data: players, isLoading } = useQuery({
    queryKey: ['players', filters],
    queryFn: async () => {
      const params = Object.fromEntries(Object.entries(filters).filter(([_, v]) => v))
      const res = await api.get('/players', { params })
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

  const { data: ageGroups } = useQuery({
    queryKey: ['age-groups'],
    queryFn: async () => {
      const res = await api.get('/age-groups')
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
          <h1 className="text-2xl font-bold">Players</h1>
          <p className="text-gray-500">Manage all players across your teams</p>
        </div>
        <div className="flex gap-2">
          <Link to="/players/bulk-edit" className="btn btn-outline flex items-center gap-2">
            <FiEdit /> Bulk Edit
          </Link>
          <Link to="/players/bulk-add" className="btn btn-outline">Bulk Add</Link>
          <Link to="/players/add" className="btn btn-primary flex items-center gap-2">
            <FiPlus /> Add Player
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <FiFilter className="text-gray-400" />
          <span className="font-medium">Filters</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <select
            value={filters.team_id}
            onChange={(e) => setFilters({ ...filters, team_id: e.target.value })}
            className="input"
          >
            <option value="">All Teams</option>
            {teams?.map((team) => (
              <option key={team.id} value={team.id}>{team.team_name}</option>
            ))}
          </select>
          <select
            value={filters.age_group_id}
            onChange={(e) => setFilters({ ...filters, age_group_id: e.target.value })}
            className="input"
          >
            <option value="">All Age Groups</option>
            {ageGroups?.map((group) => (
              <option key={group.id} value={group.id}>{group.group_name}</option>
            ))}
          </select>
          <select
            value={filters.category}
            onChange={(e) => setFilters({ ...filters, category: e.target.value })}
            className="input"
          >
            <option value="">All Categories</option>
            <option value="pole">Pole</option>
            <option value="rope">Rope</option>
            <option value="hanging">Hanging</option>
          </select>
          <select
            value={filters.gender}
            onChange={(e) => setFilters({ ...filters, gender: e.target.value })}
            className="input"
          >
            <option value="">All Genders</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
        </div>
      </div>

      {/* Players Table */}
      <div className="card overflow-hidden">
        {players?.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500 mb-4">No players found</p>
            <Link to="/players/add" className="btn btn-primary">Add First Player</Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="table-header">
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Reg. No</th>
                  <th className="px-4 py-3">Team</th>
                  <th className="px-4 py-3">Age Group</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Gender</th>
                  <th className="px-4 py-3">DOB</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {players?.map((player) => (
                  <tr key={player.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">
                      {player.first_name} {player.last_name}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">{player.registration_number}</td>
                    <td className="px-4 py-3 text-sm">{player.team_name}</td>
                    <td className="px-4 py-3 text-sm">{player.age_group_name}</td>
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
                    <td className="px-4 py-3">
                      <Link 
                        to={`/players/${player.id}/edit`}
                        className="p-2 text-gray-500 hover:text-primary-600 hover:bg-gray-100 rounded inline-flex"
                        title="Edit player"
                      >
                        <FiEdit2 size={16} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

export default Players
