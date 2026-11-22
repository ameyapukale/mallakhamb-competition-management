import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import api from '../../services/api'
import { useAuthStore } from '../../store/authStore'
import { FiUsers, FiPlus, FiUserCheck } from 'react-icons/fi'

const categoryColors = {
  pole: 'bg-blue-100 text-blue-700',
  rope: 'bg-green-100 text-green-700',
  hanging: 'bg-purple-100 text-purple-700'
}

const JudgePanels = () => {
  const { user } = useAuthStore()
  const isAdmin = user?.role === 'admin'

  // Returns every panel for every active competition, for admins and judges alike.
  // my_position is set only for the panels the caller personally sits on.
  const { data: panels, isLoading } = useQuery({
    queryKey: ['my-panels'],
    queryFn: async () => {
      const res = await api.get('/judge-panels/my/panels')
      return res.data.data
    }
  })

  // Group by competition so a judge working two events can tell them apart
  const grouped = useMemo(() => {
    if (!panels) return []
    const byCompetition = new Map()
    for (const panel of panels) {
      if (!byCompetition.has(panel.competition_id)) {
        byCompetition.set(panel.competition_id, {
          competitionId: panel.competition_id,
          competitionName: panel.competition_name,
          panels: []
        })
      }
      byCompetition.get(panel.competition_id).panels.push(panel)
    }
    return [...byCompetition.values()]
  }, [panels])

  if (isLoading) {
    return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div></div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Judge Panels</h1>
          <p className="text-gray-500">
            {isAdmin
              ? 'All panels for active competitions'
              : 'Panels for active competitions — your own positions are highlighted'}
          </p>
        </div>
        {isAdmin && (
          <Link to="/panels/create" className="btn btn-primary flex items-center gap-2 whitespace-nowrap">
            <FiPlus className="w-4 h-4" /> Create Panel
          </Link>
        )}
      </div>

      {!panels?.length ? (
        <div className="card text-center py-12">
          <FiUsers className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No panels yet</h3>
          <p className="text-gray-500 mb-4">
            {isAdmin
              ? 'Create a panel for an active competition to get started.'
              : 'No panels have been created for the active competitions yet.'}
          </p>
          {isAdmin && (
            <Link to="/panels/create" className="btn btn-primary inline-flex items-center gap-2">
              <FiPlus className="w-4 h-4" /> Create Panel
            </Link>
          )}
        </div>
      ) : (
        grouped.map((group) => (
          <div key={group.competitionId} className="space-y-3">
            <h2 className="text-lg font-semibold text-gray-700">{group.competitionName}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {group.panels.map((panel) => (
                <Link
                  key={panel.id}
                  to={`/panels/${panel.id}`}
                  className={`card hover:shadow-lg transition-shadow ${
                    panel.my_position ? 'ring-2 ring-primary-500' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <span className={`px-2 py-1 text-xs rounded-full capitalize ${
                      categoryColors[panel.category] || 'bg-gray-100 text-gray-700'
                    }`}>
                      {panel.category}
                    </span>
                    {panel.my_position_label && (
                      <span className="px-2 py-1 text-xs rounded-full bg-primary-100 text-primary-700 font-medium whitespace-nowrap">
                        You: {panel.my_position_label}
                      </span>
                    )}
                  </div>

                  <h3 className="font-semibold">{panel.panel_name}</h3>
                  <p className="text-sm text-gray-500">{panel.age_group_name?.trim()}</p>

                  <div className="mt-3 pt-3 border-t space-y-1">
                    <p className="text-xs text-gray-500 flex items-center gap-1">
                      <FiUserCheck className="w-3 h-3" />
                      {panel.members?.length || 0} of 7 positions filled
                    </p>
                    {panel.members?.slice(0, 3).map((m) => (
                      <p key={m.id} className="text-xs text-gray-400 truncate">
                        {m.position_label}: {m.display_name}
                      </p>
                    ))}
                    {panel.members?.length > 3 && (
                      <p className="text-xs text-gray-400">+{panel.members.length - 3} more</p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  )
}

export default JudgePanels
