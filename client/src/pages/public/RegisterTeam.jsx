import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import { FiArrowLeft, FiCheckCircle } from 'react-icons/fi'
import api from '../../services/api'
import TeamForm from '../../components/TeamForm'
import {
  APPARATUS_BADGE, apparatusLabel, errorMessage, formatDate, formatDateRange, playerGenderLabel
} from '../../utils/competition'

const RegisterTeam = () => {
  const { competitionId } = useParams()
  const queryClient = useQueryClient()
  const [registered, setRegistered] = useState(null)
  const [formKey, setFormKey] = useState(0)

  const { data: competition, isLoading, isError } = useQuery({
    queryKey: ['public-competition', competitionId],
    queryFn: async () => (await api.get(`/public/competitions/${competitionId}`)).data.data
  })

  const registerMutation = useMutation({
    mutationFn: (payload) => api.post(`/public/competitions/${competitionId}/register`, payload),
    onSuccess: (res) => {
      setRegistered(res.data.data)
      queryClient.invalidateQueries({ queryKey: ['public-competitions'] })
      window.scrollTo({ top: 0, behavior: 'smooth' })
    },
    onError: (error) => toast.error(errorMessage(error, 'Registration failed. Please try again.'), { duration: 6000 })
  })

  if (isLoading) return <div className="text-center py-20 text-gray-500">Loading…</div>
  if (isError || !competition) {
    return (
      <div className="card text-center py-12">
        <p className="text-gray-600">This competition could not be found.</p>
        <Link to="/" className="text-primary-600 hover:underline mt-2 inline-block">Back to home</Link>
      </div>
    )
  }

  const header = (
    <div className="mb-6">
      <Link to="/" className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 mb-3">
        <FiArrowLeft /> Back
      </Link>
      <h1 className="text-2xl font-bold">{competition.competition_name}</h1>
      <p className="text-gray-500">
        {formatDateRange(competition.start_date, competition.end_date)}
        {competition.venue ? ` · ${competition.venue}` : ''}
      </p>
    </div>
  )

  if (registered) {
    return (
      <div className="max-w-2xl mx-auto">
        {header}
        <div className="card text-center">
          <FiCheckCircle className="w-14 h-14 text-green-600 mx-auto" />
          <h2 className="text-xl font-semibold mt-3">{registered.team_name} is registered!</h2>
          <p className="text-gray-500 mt-1">
            Team code <span className="font-mono font-medium text-gray-800">{registered.team_code}</span> — keep it for reference.
          </p>

          <div className="text-left mt-6 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="table-header">
                  <th className="px-3 py-2">Player</th>
                  <th className="px-3 py-2">Date of birth</th>
                  <th className="px-3 py-2">Age group</th>
                  <th className="px-3 py-2">Apparatus</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {registered.players.map((p) => (
                  <tr key={p.name + p.date_of_birth}>
                    <td className="px-3 py-2 font-medium">
                      {p.name} <span className="text-gray-400 font-normal">({playerGenderLabel(p.gender)})</span>
                      {p.name_marathi && <span className="block text-xs font-normal text-gray-500" lang="mr">{p.name_marathi}</span>}
                    </td>
                    <td className="px-3 py-2">{formatDate(p.date_of_birth)}</td>
                    <td className="px-3 py-2">{p.age_group} <span className="text-gray-400">({p.age})</span></td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {p.apparatus.map((a) => (
                          <span key={a} className={`text-xs rounded-full px-2 py-0.5 ${APPARATUS_BADGE[a]}`}>
                            {apparatusLabel(a)}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-sm text-gray-500 mt-6">
            Need to change something? Contact the organiser
            {competition.organizer_contact ? ` (${competition.organizer_contact})` : ''}.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-3 mt-6">
            <button
              onClick={() => { setRegistered(null); setFormKey((k) => k + 1) }}
              className="btn btn-outline"
            >
              Register another team
            </button>
            <Link to="/" className="btn btn-primary">Done</Link>
          </div>
        </div>
      </div>
    )
  }

  if (!competition.registration_open) {
    return (
      <div className="max-w-2xl mx-auto">
        {header}
        <div className="card text-center py-10">
          <p className="font-medium">Registration for this competition is closed.</p>
          <Link to="/" className="text-primary-600 hover:underline mt-2 inline-block">Back to home</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto">
      {header}
      <div className="card">
        <h2 className="text-lg font-semibold mb-1">Register your team</h2>
        <p className="text-sm text-gray-500 mb-6">
          Enter your team name, then add each player as a boy or girl with their date of birth. Their age group
          is worked out automatically.
        </p>
        <TeamForm
          key={formKey}
          ageGroups={competition.age_groups}
          referenceDate={competition.age_reference_date}
          maxPlayers={competition.max_players_per_team}
          onSubmit={(payload) => registerMutation.mutate(payload)}
          submitting={registerMutation.isPending}
        />
      </div>
    </div>
  )
}

export default RegisterTeam
