import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import api from '../../services/api'
import { FiUsers, FiUserPlus, FiCalendar } from 'react-icons/fi'

const RegisteredJudges = () => {
  const [competitionId, setCompetitionId] = useState('')

  const { data: competitions } = useQuery({
    queryKey: ['admin-active-competitions'],
    queryFn: async () => {
      const res = await api.get('/competitions/judge/active')
      return res.data.data
    }
  })

  // Land on the first active competition rather than an empty screen
  useEffect(() => {
    if (!competitionId && competitions?.length) {
      setCompetitionId(String(competitions[0].id))
    }
  }, [competitions, competitionId])

  const { data: judges, isLoading } = useQuery({
    queryKey: ['competition-judges', competitionId],
    queryFn: async () => {
      const res = await api.get(`/competitions/${competitionId}/judges`)
      return res.data.data
    },
    enabled: !!competitionId
  })

  const selected = competitions?.find((c) => String(c.id) === String(competitionId))

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Registered Judges</h1>
          <p className="text-gray-500">Judges who have registered themselves for a competition</p>
        </div>
        {competitionId && (
          <Link
            to={`/admin/register-judge?competition=${competitionId}`}
            className="btn btn-primary flex items-center gap-2 whitespace-nowrap"
          >
            <FiUserPlus className="w-4 h-4" /> Register Judge
          </Link>
        )}
      </div>

      <div className="card">
        <label className="label">Competition</label>
        <select
          value={competitionId}
          onChange={(e) => setCompetitionId(e.target.value)}
          className="input max-w-xl"
        >
          <option value="">Select a competition</option>
          {competitions?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.competition_name} — {c.registered_judges} registered
            </option>
          ))}
        </select>
      </div>

      {!competitions?.length ? (
        <div className="card text-center py-12">
          <FiCalendar className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No active competitions</h3>
          <p className="text-gray-500">
            Judges can register once a competition is open for registration or ongoing.
          </p>
        </div>
      ) : isLoading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div></div>
      ) : !judges?.length ? (
        <div className="card text-center py-12">
          <FiUsers className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No judges registered yet</h3>
          <p className="text-gray-500 mb-4">
            {selected?.competition_name
              ? `Nobody has registered for ${selected.competition_name} yet.`
              : 'Nobody has registered yet.'}
          </p>
          <Link
            to={`/admin/register-judge?competition=${competitionId}`}
            className="btn btn-primary inline-flex items-center gap-2"
          >
            <FiUserPlus className="w-4 h-4" /> Register Judge
          </Link>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">
              {judges.length} judge{judges.length === 1 ? '' : 's'} registered
            </h2>
            <span className="text-sm text-gray-500">
              {judges.filter((j) => j.assignments.length > 0).length} assigned to a panel
            </span>
          </div>

          <table className="w-full">
            <thead>
              <tr className="table-header">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Username</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Account Role</th>
                <th className="px-4 py-3">Registered</th>
                <th className="px-4 py-3">Panel Assignments</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {judges.map((judge) => (
                <tr key={judge.registration_id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{judge.full_name}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{judge.username}</td>
                  <td className="px-4 py-3 text-sm">{judge.email}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 text-xs rounded-full ${
                      judge.role === 'judge' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                    }`}>
                      {judge.role?.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {new Date(judge.registered_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    {judge.assignments.length === 0 ? (
                      <span className="text-sm text-gray-400 italic">Not assigned</span>
                    ) : (
                      <div className="space-y-1">
                        {judge.assignments.map((a) => (
                          <Link
                            key={`${a.panel_id}-${a.position}`}
                            to={`/panels/${a.panel_id}`}
                            className="block text-sm text-primary-600 hover:underline"
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

export default RegisteredJudges
