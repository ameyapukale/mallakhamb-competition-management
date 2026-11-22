import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { FiPlus, FiCalendar, FiMapPin, FiUsers } from 'react-icons/fi'
import api from '../../services/api'
import { formatDateRange, statusInfo } from '../../utils/competition'

const AdminCompetitions = () => {
  const { data: competitions, isLoading } = useQuery({
    queryKey: ['admin-competitions'],
    queryFn: async () => (await api.get('/admin/competitions')).data.data
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Competitions</h1>
          <p className="text-gray-500">Create a competition, open registration, then score and publish results.</p>
        </div>
        <Link to="/admin/competitions/new" className="btn btn-primary inline-flex items-center gap-2">
          <FiPlus /> Create competition
        </Link>
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-gray-500">Loading…</div>
      ) : !competitions?.length ? (
        <div className="card text-center py-16">
          <p className="text-4xl mb-3">🏆</p>
          <p className="font-medium">No competitions yet</p>
          <p className="text-gray-500 text-sm mt-1">Create one to get started.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {competitions.map((c) => {
            const status = statusInfo(c.status)
            return (
              <Link key={c.id} to={`/admin/competitions/${c.id}`} className="card hover:shadow-lg transition-shadow block">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="font-semibold text-lg leading-snug">{c.competition_name}</h2>
                  <span className={`shrink-0 text-xs rounded-full px-2 py-1 ${status.badge}`}>{status.label}</span>
                </div>
                <div className="mt-3 space-y-1 text-sm text-gray-600">
                  <p className="flex items-center gap-2"><FiCalendar /> {formatDateRange(c.start_date, c.end_date)}</p>
                  {(c.venue || c.city) && (
                    <p className="flex items-center gap-2"><FiMapPin /> {[c.venue, c.city].filter(Boolean).join(', ')}</p>
                  )}
                  <p className="flex items-center gap-2">
                    <FiUsers /> {c.team_count} team{Number(c.team_count) === 1 ? '' : 's'} · {c.player_count} players · {c.age_groups.length} age groups
                  </p>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default AdminCompetitions
