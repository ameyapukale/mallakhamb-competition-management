import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import api from '../services/api'
import { useAuthStore } from '../store/authStore'
import { FiUsers, FiCalendar, FiAward, FiTrendingUp, FiPlus, FiArrowRight, FiClipboard, FiCheckSquare, FiUserCheck } from 'react-icons/fi'

const Dashboard = () => {
  const { user } = useAuthStore()

  const { data: competitions } = useQuery({
    queryKey: ['competitions-active'],
    queryFn: async () => {
      const res = await api.get('/competitions', { params: { status: 'registration_open' } })
      return res.data.data
    }
  })

  const { data: teams } = useQuery({
    queryKey: ['teams'],
    queryFn: async () => {
      const res = await api.get('/teams')
      return res.data.data
    },
    enabled: ['admin', 'team_manager'].includes(user?.role)
  })

  const { data: myPanels } = useQuery({
    queryKey: ['my-panels'],
    queryFn: async () => {
      const res = await api.get('/judge-panels/my/panels')
      return res.data.data
    },
    enabled: ['judge', 'scorer', 'admin'].includes(user?.role)
  })

  // Active competitions plus, for a judge, whether they have registered for each
  const { data: judgeCompetitions } = useQuery({
    queryKey: ['judge-active-competitions'],
    queryFn: async () => {
      const res = await api.get('/competitions/judge/active')
      return res.data.data
    },
    enabled: ['judge', 'scorer', 'admin'].includes(user?.role)
  })

  const isJudge = ['judge', 'scorer'].includes(user?.role)
  const myAssignedPanels = myPanels?.filter((p) => p.my_position) || []
  const unregistered = judgeCompetitions?.filter((c) => !c.is_registered) || []
  const totalRegisteredJudges = judgeCompetitions?.reduce((sum, c) => sum + Number(c.registered_judges || 0), 0) || 0

  const StatCard = ({ icon: Icon, title, value, color, link }) => (
    <Link to={link} className="card hover:shadow-lg transition-shadow">
      <div className="flex items-center gap-4">
        <div className={`p-3 rounded-lg ${color}`}>
          <Icon className="w-6 h-6 text-white" />
        </div>
        <div>
          <p className="text-sm text-gray-500">{title}</p>
          <p className="text-2xl font-bold">{value}</p>
        </div>
      </div>
    </Link>
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500">Welcome back, {user?.full_name}!</p>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {['admin', 'team_manager'].includes(user?.role) && (
          <>
            <StatCard
              icon={FiUsers}
              title="My Teams"
              value={teams?.length || 0}
              color="bg-blue-500"
              link="/teams"
            />
            <StatCard
              icon={FiCalendar}
              title="Active Competitions"
              value={competitions?.length || 0}
              color="bg-green-500"
              link="/competitions"
            />
          </>
        )}
        {isJudge && (
          <>
            <StatCard
              icon={FiAward}
              title="My Positions"
              value={myAssignedPanels.length}
              color="bg-purple-500"
              link="/panels"
            />
            <StatCard
              icon={FiClipboard}
              title="Panels (Active Comps)"
              value={myPanels?.length || 0}
              color="bg-blue-500"
              link="/panels"
            />
            <StatCard
              icon={FiCheckSquare}
              title="My Registrations"
              value={(judgeCompetitions?.length || 0) - unregistered.length}
              color="bg-green-500"
              link="/judge/registration"
            />
          </>
        )}
        {user?.role === 'admin' && (
          <>
            <StatCard
              icon={FiUserCheck}
              title="Registered Judges"
              value={totalRegisteredJudges}
              color="bg-purple-500"
              link="/admin/registered-judges"
            />
            <StatCard
              icon={FiClipboard}
              title="Judge Panels"
              value={myPanels?.length || 0}
              color="bg-orange-500"
              link="/panels"
            />
          </>
        )}
      </div>

      {/* Judges who have not yet registered for an open competition */}
      {isJudge && unregistered.length > 0 && (
        <div className="card border-l-4 border-primary-500">
          <h2 className="text-lg font-semibold mb-1">Register for a competition</h2>
          <p className="text-gray-500 text-sm mb-4">
            You must register before an admin can assign you to a judge panel.
          </p>
          <div className="space-y-3">
            {unregistered.map((comp) => (
              <div key={comp.id} className="flex items-center justify-between gap-4 p-4 bg-gray-50 rounded-lg">
                <div className="min-w-0">
                  <h3 className="font-medium truncate">{comp.competition_name}</h3>
                  <p className="text-sm text-gray-500">
                    {new Date(comp.start_date).toLocaleDateString()} • {comp.registered_judges} judges registered
                  </p>
                </div>
                <Link to="/judge/registration" className="btn btn-primary text-sm whitespace-nowrap">
                  Register
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="card">
        <h2 className="text-lg font-semibold mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {user?.role === 'team_manager' && (
            <>
              <Link to="/teams/create" className="flex items-center gap-3 p-4 bg-primary-50 rounded-lg hover:bg-primary-100 transition-colors">
                <FiPlus className="w-5 h-5 text-primary-600" />
                <span className="font-medium text-primary-700">Create New Team</span>
              </Link>
              <Link to="/players/add" className="flex items-center gap-3 p-4 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors">
                <FiPlus className="w-5 h-5 text-blue-600" />
                <span className="font-medium text-blue-700">Add Player</span>
              </Link>
              <Link to="/competitions" className="flex items-center gap-3 p-4 bg-green-50 rounded-lg hover:bg-green-100 transition-colors">
                <FiCalendar className="w-5 h-5 text-green-600" />
                <span className="font-medium text-green-700">View Competitions</span>
              </Link>
            </>
          )}
          {user?.role === 'admin' && (
            <>
              <Link to="/competitions/create" className="flex items-center gap-3 p-4 bg-primary-50 rounded-lg hover:bg-primary-100 transition-colors">
                <FiPlus className="w-5 h-5 text-primary-600" />
                <span className="font-medium text-primary-700">Create Competition</span>
              </Link>
              <Link to="/admin/users" className="flex items-center gap-3 p-4 bg-purple-50 rounded-lg hover:bg-purple-100 transition-colors">
                <FiUsers className="w-5 h-5 text-purple-600" />
                <span className="font-medium text-purple-700">Manage Users</span>
              </Link>
              <Link to="/panels/create" className="flex items-center gap-3 p-4 bg-orange-50 rounded-lg hover:bg-orange-100 transition-colors">
                <FiClipboard className="w-5 h-5 text-orange-600" />
                <span className="font-medium text-orange-700">Create Judge Panel</span>
              </Link>
              <Link to="/admin/registered-judges" className="flex items-center gap-3 p-4 bg-green-50 rounded-lg hover:bg-green-100 transition-colors">
                <FiUserCheck className="w-5 h-5 text-green-600" />
                <span className="font-medium text-green-700">Registered Judges</span>
              </Link>
            </>
          )}
          {user?.role === 'scorer' && (
            <Link to="/scoring" className="flex items-center gap-3 p-4 bg-orange-50 rounded-lg hover:bg-orange-100 transition-colors">
              <FiTrendingUp className="w-5 h-5 text-orange-600" />
              <span className="font-medium text-orange-700">Enter Scores</span>
            </Link>
          )}
          {isJudge && (
            <>
              <Link to="/judge/registration" className="flex items-center gap-3 p-4 bg-primary-50 rounded-lg hover:bg-primary-100 transition-colors">
                <FiCheckSquare className="w-5 h-5 text-primary-600" />
                <span className="font-medium text-primary-700">Competition Registration</span>
              </Link>
              <Link to="/panels" className="flex items-center gap-3 p-4 bg-purple-50 rounded-lg hover:bg-purple-100 transition-colors">
                <FiClipboard className="w-5 h-5 text-purple-600" />
                <span className="font-medium text-purple-700">View Judge Panels</span>
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Active Competitions */}
      {competitions && competitions.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Open for Registration</h2>
            <Link to="/competitions" className="text-primary-600 hover:underline flex items-center gap-1">
              View all <FiArrowRight />
            </Link>
          </div>
          <div className="space-y-3">
            {competitions.slice(0, 5).map((comp) => (
              <Link
                key={comp.id}
                to={`/competitions/${comp.id}`}
                className="block p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium">{comp.competition_name}</h3>
                    <p className="text-sm text-gray-500">
                      {comp.city}, {comp.state} • {new Date(comp.start_date).toLocaleDateString()}
                    </p>
                  </div>
                  <span className="px-3 py-1 bg-green-100 text-green-700 text-sm rounded-full">
                    {comp.registered_teams || 0} teams
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Panels where this judge holds a position */}
      {isJudge && myAssignedPanels.length > 0 && (
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">My Panel Positions</h2>
          <div className="space-y-3">
            {myAssignedPanels.map((panel) => (
              <Link
                key={panel.id}
                to={`/panels/${panel.id}`}
                className="block p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <h3 className="font-medium truncate">{panel.panel_name}</h3>
                    <p className="text-sm text-gray-500">
                      {panel.competition_name} • <span className="capitalize">{panel.category}</span> - {panel.age_group_name?.trim()}
                    </p>
                  </div>
                  <span className="px-3 py-1 bg-purple-100 text-purple-700 text-sm rounded-full whitespace-nowrap">
                    {panel.my_position_label}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default Dashboard
