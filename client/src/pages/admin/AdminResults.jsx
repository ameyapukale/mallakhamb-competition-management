import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { FiArrowLeft, FiExternalLink, FiFileText, FiPrinter } from 'react-icons/fi'
import api from '../../services/api'
import ResultsView from '../../components/ResultsView'

const AdminResults = () => {
  const { id } = useParams()
  const { data: competition } = useQuery({
    queryKey: ['admin-competition', id],
    queryFn: async () => (await api.get(`/admin/competitions/${id}`)).data.data
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link to={`/admin/competitions/${id}`} className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-2 print:hidden">
            <FiArrowLeft /> {competition?.competition_name || 'Competition'}
          </Link>
          <h1 className="text-2xl font-bold">Results</h1>
          <p className="text-gray-500 print:hidden">Calculated live from the score sheets.</p>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <Link to={`/admin/competitions/${id}/scoring`} className="btn btn-outline inline-flex items-center gap-2">
            <FiFileText /> Score sheets
          </Link>
          {competition && ['ongoing', 'completed'].includes(competition.status) && (
            <a href={`/results/${id}`} target="_blank" rel="noreferrer" className="btn btn-outline inline-flex items-center gap-2">
              <FiExternalLink /> Public results
            </a>
          )}
          <button onClick={() => window.print()} className="btn btn-outline inline-flex items-center gap-2">
            <FiPrinter /> Print
          </button>
        </div>
      </div>
      <ResultsView endpoint={`/admin/competitions/${id}/results`} />
    </div>
  )
}

export default AdminResults
