import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import { FiArrowLeft, FiSave } from 'react-icons/fi'

const ScoreEntry = () => {
  const { panelId, performanceId } = useParams()
  const navigate = useNavigate()
  const [scores, setScores] = useState({})

  const { data: entryData, isLoading } = useQuery({
    queryKey: ['score-entry', panelId, performanceId],
    queryFn: async () => {
      const res = await api.get(`/scores/entry/${panelId}/${performanceId}`)
      return res.data.data
    },
    onSuccess: (data) => {
      // Initialize scores from existing data
      const initialScores = {}
      data.existingScores?.forEach(score => {
        if (!initialScores[score.panel_member_id]) {
          initialScores[score.panel_member_id] = {}
        }
        initialScores[score.panel_member_id][score.scoring_criteria_id] = score.score
      })
      setScores(initialScores)
    }
  })

  const submitMutation = useMutation({
    mutationFn: (data) => api.post('/scores/submit-bulk', data),
    onSuccess: () => {
      toast.success('Scores saved successfully!')
      navigate(-1)
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || 'Failed to save scores')
    }
  })

  const handleScoreChange = (judgeMemberId, criteriaId, value) => {
    const numValue = parseFloat(value) || 0
    setScores(prev => ({
      ...prev,
      [judgeMemberId]: {
        ...prev[judgeMemberId],
        [criteriaId]: numValue
      }
    }))
  }

  const handleSubmit = () => {
    const judgeScores = Object.entries(scores).map(([panelMemberId, criteriaScores]) => ({
      panel_member_id: parseInt(panelMemberId),
      scores: Object.entries(criteriaScores).map(([criteriaId, score]) => ({
        scoring_criteria_id: parseInt(criteriaId),
        score: parseFloat(score)
      }))
    }))

    submitMutation.mutate({
      performance_sequence_id: parseInt(performanceId),
      judge_scores: judgeScores
    })
  }

  if (isLoading) {
    return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div></div>
  }

  const { judges, criteria, performance } = entryData || {}

  return (
    <div className="space-y-6">
      <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-gray-600 hover:text-gray-900">
        <FiArrowLeft /> Back
      </button>

      <div className="card bg-primary-50">
        <h1 className="text-xl font-bold">Score Entry</h1>
        {performance && (
          <div className="mt-2">
            <p className="text-lg">#{performance.sequence_number} - {performance.player_name}</p>
            <p className="text-gray-600">{performance.team_name}</p>
          </div>
        )}
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[600px]">
          <thead>
            <tr className="table-header">
              <th className="px-4 py-2 text-left">Judge</th>
              {criteria?.map((c) => (
                <th key={c.id} className="px-4 py-2 text-center">
                  <div>
                    <p>{c.criteria_name}</p>
                    <p className="text-xs font-normal text-gray-500">Max: {c.max_points}</p>
                  </div>
                </th>
              ))}
              <th className="px-4 py-2 text-center">Total</th>
            </tr>
          </thead>
          <tbody>
            {judges?.map((judge) => {
              const judgeScores = scores[judge.panel_member_id] || {}
              const total = Object.values(judgeScores).reduce((sum, s) => sum + (parseFloat(s) || 0), 0)
              
              return (
                <tr key={judge.panel_member_id} className="border-b">
                  <td className="px-4 py-3">
                    <p className="font-medium">{judge.full_name}</p>
                    <p className="text-xs text-gray-500 capitalize">{judge.role?.replace('_', ' ')}</p>
                  </td>
                  {criteria?.map((c) => (
                    <td key={c.id} className="px-4 py-3 text-center">
                      <input
                        type="number"
                        min="0"
                        max={c.max_points}
                        step="0.1"
                        value={judgeScores[c.id] || ''}
                        onChange={(e) => handleScoreChange(judge.panel_member_id, c.id, e.target.value)}
                        className="input w-20 text-center py-1"
                        placeholder="0"
                      />
                    </td>
                  ))}
                  <td className="px-4 py-3 text-center font-bold text-primary-600">
                    {total.toFixed(1)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end gap-4">
        <button onClick={() => navigate(-1)} className="btn btn-outline">
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={submitMutation.isPending}
          className="btn btn-primary flex items-center gap-2"
        >
          <FiSave />
          {submitMutation.isPending ? 'Saving...' : 'Save Scores'}
        </button>
      </div>
    </div>
  )
}

export default ScoreEntry
