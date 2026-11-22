import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { FiCalendar, FiMapPin, FiUsers, FiUserPlus, FiBarChart2 } from 'react-icons/fi'
import api from '../../services/api'
import {
  APPARATUS_BADGE, ageRangeLabel, apparatusLabel, formatDate, formatDateRange, groupGenderLabel, statusInfo
} from '../../utils/competition'

const Home = () => {
  const { data: competitions, isLoading, isError } = useQuery({
    queryKey: ['public-competitions'],
    queryFn: async () => (await api.get('/public/competitions')).data.data
  })

  if (isLoading) {
    return <div className="text-center py-20 text-gray-500">Loading competitions…</div>
  }

  if (isError) {
    return <div className="card text-center text-red-600">Could not load competitions. Please refresh the page.</div>
  }

  if (!competitions?.length) {
    return (
      <div className="card text-center py-16">
        <p className="text-4xl mb-3">🏆</p>
        <h1 className="text-xl font-semibold">No competitions are open right now</h1>
        <p className="text-gray-500 mt-1">Please check back later.</p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {competitions.map((c) => {
        const status = statusInfo(c.status)
        const showResults = c.status === 'ongoing' || c.status === 'completed'
        return (
          <section key={c.id} className="card p-0 overflow-hidden">
            <div className="bg-gradient-to-br from-primary-500 to-primary-700 text-white px-6 py-8 sm:px-10">
              <span className="inline-block text-xs font-medium bg-white/20 rounded-full px-3 py-1 mb-3">
                {status.label}
              </span>
              <h1 className="text-2xl sm:text-3xl font-bold leading-tight">{c.competition_name}</h1>
              <div className="flex flex-wrap gap-x-6 gap-y-2 mt-4 text-primary-50 text-sm">
                <span className="inline-flex items-center gap-1.5">
                  <FiCalendar /> {formatDateRange(c.start_date, c.end_date)}
                </span>
                {(c.venue || c.city) && (
                  <span className="inline-flex items-center gap-1.5">
                    <FiMapPin /> {[c.venue, c.city, c.state].filter(Boolean).join(', ')}
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5">
                  <FiUsers /> {c.registered_teams} team{c.registered_teams === 1 ? '' : 's'} registered
                </span>
              </div>

              <div className="flex flex-wrap gap-3 mt-6">
                {c.registration_open && (
                  <Link
                    to={`/register-team/${c.id}`}
                    className="inline-flex items-center gap-2 bg-white text-primary-700 font-semibold rounded-lg px-5 py-3 hover:bg-primary-50 transition-colors"
                  >
                    <FiUserPlus className="w-5 h-5" /> Register your team
                  </Link>
                )}
                {showResults && (
                  <Link
                    to={`/results/${c.id}`}
                    className="inline-flex items-center gap-2 bg-white/10 border border-white/40 text-white font-semibold rounded-lg px-5 py-3 hover:bg-white/20 transition-colors"
                  >
                    <FiBarChart2 className="w-5 h-5" /> {c.status === 'completed' ? 'Results' : 'Live results'}
                  </Link>
                )}
              </div>
            </div>

            <div className="px-6 py-6 sm:px-10 space-y-4">
              {c.description && <p className="text-gray-700 whitespace-pre-line">{c.description}</p>}

              <div>
                <h2 className="font-semibold mb-2">Age groups</h2>
                <p className="text-sm text-gray-500 mb-3">
                  Age is counted as on {formatDate(c.age_reference_date)}. Each player is placed in an
                  age group automatically from their gender and date of birth.
                </p>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {c.age_groups.map((g) => (
                    <div key={g.id} className="border rounded-lg px-4 py-3">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-medium">{g.group_name}</span>
                        <span className="text-xs text-gray-500 whitespace-nowrap">
                          {groupGenderLabel(g.gender)} · {ageRangeLabel(g)}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {g.apparatus.map((a) => (
                          <span key={a} className={`text-xs rounded-full px-2 py-0.5 ${APPARATUS_BADGE[a]}`}>
                            {apparatusLabel(a)}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {(c.organizer_name || c.organizer_contact) && (
                <p className="text-sm text-gray-500">
                  Organised by {[c.organizer_name, c.organizer_contact].filter(Boolean).join(' · ')}
                </p>
              )}
            </div>
          </section>
        )
      })}
    </div>
  )
}

export default Home
