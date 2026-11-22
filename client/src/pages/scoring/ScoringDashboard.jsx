import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import api from '../../services/api'
import { FiEdit3, FiFileText } from 'react-icons/fi'

const ScoringDashboard = () => {
  const { data: panels, isLoading } = useQuery({
    queryKey: ['my-panels'],
    queryFn: async () => {
      const res = await api.get('/judge-panels/my/panels')
      return res.data.data
    }
  })

  if (isLoading) {
    return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div></div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Scoring Dashboard</h1>
          <p className="text-gray-500">Enter scores for performances</p>
        </div>
        <Link to="/scoring/sheet" className="btn btn-primary flex items-center gap-2 whitespace-nowrap">
          <FiFileText className="w-4 h-4" /> Open गुणपत्रिका
        </Link>
      </div>

      {panels?.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-gray-500">No panels assigned to you</p>
        </div>
      ) : (
        <div className="space-y-6">
          {panels?.map((panel) => (
            <PanelScoringCard key={panel.id} panel={panel} />
          ))}
        </div>
      )}
    </div>
  )
}

const PanelScoringCard = ({ panel }) => {
  const { data: lotteryDraws } = useQuery({
    queryKey: ['lottery-draws', panel.competition_id],
    queryFn: async () => {
      const res = await api.get(`/lottery/competition/${panel.competition_id}`)
      return res.data.data
    }
  })

  const draw = lotteryDraws?.find(d => d.competition_category_id === panel.competition_category_id)

  const { data: sequences } = useQuery({
    queryKey: ['lottery-sequence', draw?.id],
    queryFn: async () => {
      const res = await api.get(`/lottery/sequence/${draw.id}`)
      return res.data.data
    },
    enabled: !!draw?.id
  })

  const pendingScoring = sequences?.filter(s => s.performance_status === 'completed') || []

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold">{panel.panel_name}</h2>
          <p className="text-sm text-gray-500">
            {panel.competition_name} • {panel.category} - {panel.age_group_name}
          </p>
        </div>
        <span className={`px-2 py-1 text-xs rounded-full ${
          panel.category === 'pole' ? 'bg-blue-100 text-blue-700' :
          panel.category === 'rope' ? 'bg-green-100 text-green-700' :
          'bg-purple-100 text-purple-700'
        }`}>
          {panel.category}
        </span>
      </div>

      {!draw ? (
        <p className="text-gray-500">Lottery not conducted yet</p>
      ) : pendingScoring.length === 0 ? (
        <p className="text-gray-500">No performances ready for scoring</p>
      ) : (
        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-700 mb-3">
            Completed Performances ({pendingScoring.length})
          </p>
          {pendingScoring.map((perf) => (
            <Link
              key={perf.id}
              to={`/scoring/${panel.id}/${perf.id}`}
              className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <div>
                <span className="font-medium">#{perf.sequence_number}</span>
                <span className="ml-2">{perf.player_name}</span>
                <span className="text-sm text-gray-500 ml-2">({perf.team_name})</span>
              </div>
              <div className="flex items-center gap-2 text-primary-600">
                <FiEdit3 className="w-4 h-4" />
                Enter Scores
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

export default ScoringDashboard
