import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import api from '../../services/api'
import { useAuthStore } from '../../store/authStore'
import { FiPlus, FiCalendar, FiMapPin, FiUsers, FiEdit } from 'react-icons/fi'
import JudgeRegisterButton from '../../components/JudgeRegisterButton'

const Competitions = () => {
  const { user } = useAuthStore()

  const { data: competitions, isLoading } = useQuery({
    queryKey: ['competitions'],
    queryFn: async () => {
      const res = await api.get('/competitions')
      return res.data.data
    }
  })

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

  if (isLoading) {
    return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div></div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Competitions</h1>
          <p className="text-gray-500">Browse and register for competitions</p>
        </div>
        {user?.role === 'admin' && (
          <Link to="/competitions/create" className="btn btn-primary flex items-center gap-2">
            <FiPlus /> Create Competition
          </Link>
        )}
      </div>

      {competitions?.length === 0 ? (
        <div className="card text-center py-12">
          <FiCalendar className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No competitions yet</h3>
          <p className="text-gray-500">Check back later for upcoming competitions</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {competitions?.map((comp) => (
            // The card is a div rather than a Link so the judge register button can
            // live inside it without a click also navigating to the detail page.
            <div key={comp.id} className="card hover:shadow-lg transition-shadow flex flex-col">
              <Link to={`/competitions/${comp.id}`} className="block">
              <div className="flex items-start justify-between mb-4">
                <span className={`px-3 py-1 text-xs rounded-full ${getStatusColor(comp.status)}`}>
                  {comp.status?.replace('_', ' ')}
                </span>
                {comp.entry_fee > 0 && (
                  <span className="text-sm font-medium text-primary-600">₹{comp.entry_fee}</span>
                )}
              </div>
              
              <h3 className="font-semibold text-lg mb-2">{comp.competition_name}</h3>
              
              <div className="space-y-2 text-sm text-gray-500 mb-4">
                <div className="flex items-center gap-2">
                  <FiCalendar className="w-4 h-4" />
                  {new Date(comp.start_date).toLocaleDateString()} - {new Date(comp.end_date).toLocaleDateString()}
                </div>
                {comp.city && (
                  <div className="flex items-center gap-2">
                    <FiMapPin className="w-4 h-4" />
                    {comp.city}, {comp.state}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <FiUsers className="w-4 h-4" />
                  {comp.registered_teams || 0} teams registered
                </div>
              </div>

              {comp.status === 'registration_open' && (
                <div className="pt-4 border-t">
                  <p className="text-xs text-gray-500">
                    Registration ends: {new Date(comp.registration_end_date).toLocaleDateString()}
                  </p>
                </div>
              )}
              </Link>

              {/* Judges and scorers register for themselves right here */}
              <div className="mt-4 flex items-center justify-between gap-2 empty:mt-0">
                <JudgeRegisterButton competitionId={comp.id} size="small" />
                {user?.role === 'admin' && (
                  <Link
                    to={`/competitions/${comp.id}/edit`}
                    className="btn btn-outline text-sm py-1 px-3 flex items-center gap-1 ml-auto"
                  >
                    <FiEdit className="w-3 h-3" /> Edit
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default Competitions
