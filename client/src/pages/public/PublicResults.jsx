import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { FiArrowLeft } from 'react-icons/fi'
import api from '../../services/api'
import ResultsView from '../../components/ResultsView'
import { formatDateRange, statusInfo } from '../../utils/competition'

const PublicResults = () => {
  const { competitionId } = useParams()

  const { data: competition, isError } = useQuery({
    queryKey: ['public-competition', competitionId],
    queryFn: async () => (await api.get(`/public/competitions/${competitionId}`)).data.data
  })

  if (isError) {
    return (
      <div className="card text-center py-12">
        <p className="text-gray-600">This competition could not be found.</p>
        <Link to="/" className="text-primary-600 hover:underline mt-2 inline-block">Back to home</Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 mb-3">
          <FiArrowLeft /> Back
        </Link>
        {competition && (
          <>
            <h1 className="text-2xl font-bold">{competition.competition_name}</h1>
            <p className="text-gray-500">
              {formatDateRange(competition.start_date, competition.end_date)} ·{' '}
              {competition.status === 'completed' ? 'Final results' : statusInfo(competition.status).label}
            </p>
          </>
        )}
      </div>
      <ResultsView
        endpoint={`/public/competitions/${competitionId}/results`}
        live={competition?.status !== 'completed'}
      />
    </div>
  )
}

export default PublicResults
