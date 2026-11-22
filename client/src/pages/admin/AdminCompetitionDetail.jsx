import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import {
  FiArrowLeft, FiEdit2, FiTrash2, FiExternalLink, FiFileText, FiBarChart2,
  FiChevronDown, FiChevronRight, FiPlus, FiX, FiRefreshCw
} from 'react-icons/fi'
import api from '../../services/api'
import TeamForm from '../../components/TeamForm'
import {
  APPARATUS_BADGE, GENDER_BADGE, STATUSES, apparatusLabel, errorMessage, formatDate, formatDateRange,
  ageRangeLabel, groupGenderLabel, playerGenderLabel, statusInfo
} from '../../utils/competition'

const Modal = ({ title, onClose, children }) => (
  <div className="fixed inset-0 z-40 bg-black/40 flex items-start justify-center p-4 overflow-y-auto" role="dialog" aria-modal="true">
    <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl my-8">
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <h2 className="text-lg font-semibold">{title}</h2>
        <button onClick={onClose} className="p-1 text-gray-500 hover:text-gray-900" aria-label="Close"><FiX className="w-5 h-5" /></button>
      </div>
      <div className="p-6">{children}</div>
    </div>
  </div>
)

const AdminCompetitionDetail = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [expanded, setExpanded] = useState({})
  const [editing, setEditing] = useState(null) // team object, or 'new'

  const { data: c, isLoading } = useQuery({
    queryKey: ['admin-competition', id],
    queryFn: async () => (await api.get(`/admin/competitions/${id}`)).data.data
  })

  const { data: teams } = useQuery({
    queryKey: ['admin-teams', id],
    queryFn: async () => (await api.get(`/admin/competitions/${id}/teams`)).data.data
  })

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-competition', id] })
    queryClient.invalidateQueries({ queryKey: ['admin-teams', id] })
    queryClient.invalidateQueries({ queryKey: ['admin-competitions'] })
  }

  const statusMutation = useMutation({
    mutationFn: (status) => api.patch(`/admin/competitions/${id}/status`, { status }),
    onSuccess: () => { toast.success('Status updated'); refresh() },
    onError: (e) => toast.error(errorMessage(e, 'Failed to update status'))
  })

  const teamMutation = useMutation({
    mutationFn: ({ team, payload }) => team === 'new'
      ? api.post(`/admin/competitions/${id}/teams`, payload)
      : api.put(`/admin/teams/${team.registration_id}`, payload),
    onSuccess: (res) => { toast.success(res.data.message); setEditing(null); refresh() },
    onError: (e) => toast.error(errorMessage(e, 'Failed to save team'), { duration: 6000 })
  })

  const deleteTeamMutation = useMutation({
    mutationFn: (team) => api.delete(`/admin/teams/${team.registration_id}`),
    onSuccess: (res) => { toast.success(res.data.message); refresh() },
    onError: (e) => toast.error(errorMessage(e, 'Failed to delete team'), { duration: 6000 })
  })

  const deleteCompetitionMutation = useMutation({
    mutationFn: () => api.delete(`/admin/competitions/${id}`),
    onSuccess: () => {
      toast.success('Competition deleted')
      queryClient.invalidateQueries({ queryKey: ['admin-competitions'] })
      navigate('/admin')
    },
    onError: (e) => toast.error(errorMessage(e, 'Failed to delete competition'))
  })

  const rebuildMutation = useMutation({
    mutationFn: () => api.post(`/admin/competitions/${id}/rebuild`),
    onSuccess: (res) => {
      const unassigned = res.data.data.unassigned
      if (unassigned.length) {
        toast(`Sheets rebuilt. No age group for: ${unassigned.map((p) => `${p.name} (${p.age})`).join(', ')}`, { icon: '⚠️', duration: 8000 })
      } else toast.success(res.data.message)
      refresh()
    },
    onError: (e) => toast.error(errorMessage(e, 'Failed to rebuild'))
  })

  if (isLoading || !c) return <div className="text-center py-16 text-gray-500">Loading…</div>

  const status = statusInfo(c.status)
  const isPublic = c.status !== 'draft'
  const playerTotal = teams?.reduce((s, t) => s + t.player_count, 0) ?? 0
  const unassignedCount = teams?.reduce((s, t) => s + t.players.filter((p) => !p.age_group_id).length, 0) ?? 0
  const pct = c.counts.row_count ? Math.round((c.counts.scored_count / c.counts.row_count) * 100) : 0

  return (
    <div className="space-y-6">
      <Link to="/admin" className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900">
        <FiArrowLeft /> All competitions
      </Link>

      {/* Header */}
      <div className="card">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <span className={`inline-block text-xs rounded-full px-2 py-1 mb-2 ${status.badge}`}>{status.label}</span>
            <h1 className="text-2xl font-bold">{c.competition_name}</h1>
            <p className="text-gray-500">
              {formatDateRange(c.start_date, c.end_date)}
              {c.venue ? ` · ${c.venue}` : ''}{c.city ? `, ${c.city}` : ''}
            </p>
            <p className="text-sm text-gray-500 mt-1">Ages counted as on {formatDate(c.effective_age_reference_date)}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to={`/admin/competitions/${id}/edit`} className="btn btn-outline inline-flex items-center gap-2">
              <FiEdit2 /> Edit
            </Link>
            {isPublic && (
              <a href="/" target="_blank" rel="noreferrer" className="btn btn-outline inline-flex items-center gap-2">
                <FiExternalLink /> Public page
              </a>
            )}
            <button
              onClick={() => {
                if (window.confirm(`Delete "${c.competition_name}"? It will disappear from the home page and the admin list.`)) {
                  deleteCompetitionMutation.mutate()
                }
              }}
              className="btn text-red-600 hover:bg-red-50 inline-flex items-center gap-2"
            >
              <FiTrash2 /> Delete
            </button>
          </div>
        </div>

        {/* Status */}
        <div className="mt-6">
          <p className="text-sm font-medium text-gray-700 mb-2">Status</p>
          <div className="flex flex-wrap gap-2">
            {STATUSES.map((s) => (
              <button
                key={s.value}
                onClick={() => s.value !== c.status && statusMutation.mutate(s.value)}
                disabled={statusMutation.isPending}
                title={s.hint}
                className={`px-3 py-2 rounded-lg text-sm border transition-colors ${
                  s.value === c.status
                    ? 'bg-primary-600 border-primary-600 text-white font-medium'
                    : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-2">{status.hint}</p>
        </div>
      </div>

      {/* Actions + stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Link to={`/admin/competitions/${id}/scoring`} className="card hover:shadow-lg transition-shadow flex items-start gap-4">
          <FiFileText className="w-8 h-8 text-primary-600 shrink-0" />
          <div className="flex-1">
            <h2 className="font-semibold">Score sheets</h2>
            <p className="text-sm text-gray-500">{c.counts.sheet_count} sheets · {c.counts.scored_count}/{c.counts.row_count} scored</p>
            <div className="h-1.5 bg-gray-100 rounded-full mt-2 overflow-hidden">
              <div className="h-full bg-primary-500" style={{ width: `${pct}%` }} />
            </div>
          </div>
        </Link>
        <Link to={`/admin/competitions/${id}/results`} className="card hover:shadow-lg transition-shadow flex items-start gap-4">
          <FiBarChart2 className="w-8 h-8 text-primary-600 shrink-0" />
          <div>
            <h2 className="font-semibold">Results &amp; rankings</h2>
            <p className="text-sm text-gray-500">Individual, team and overall, per age group</p>
          </div>
        </Link>
        <div className="card">
          <h2 className="font-semibold">Age groups</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {c.age_groups.map((g) => (
              <li key={g.id} className="flex flex-wrap items-center gap-1">
                <span className="font-medium mr-1">{g.group_name}</span>
                <span className={`text-xs rounded-full px-1.5 ${GENDER_BADGE[g.gender]}`}>{groupGenderLabel(g.gender)}</span>
                <span className="text-gray-400 mr-1">{ageRangeLabel(g)}</span>
                {g.apparatus.map((a) => (
                  <span key={a} className={`text-xs rounded-full px-1.5 ${APPARATUS_BADGE[a]}`}>{apparatusLabel(a)}</span>
                ))}
              </li>
            ))}
          </ul>
          <p className="text-xs text-gray-500 mt-3">
            Team score: {c.team_best_count ? `best ${c.team_best_count} players per apparatus` : 'all players'}
          </p>
        </div>
      </div>

      {/* Teams */}
      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-lg font-semibold">Registered teams</h2>
            <p className="text-sm text-gray-500">{teams?.length ?? 0} teams · {playerTotal} players</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => rebuildMutation.mutate()}
              disabled={rebuildMutation.isPending}
              className="btn btn-outline inline-flex items-center gap-2 text-sm"
              title="Re-check every player's age group and regenerate missing score sheets"
            >
              <FiRefreshCw className={rebuildMutation.isPending ? 'animate-spin' : ''} /> Re-sync sheets
            </button>
            <button onClick={() => setEditing('new')} className="btn btn-primary inline-flex items-center gap-2 text-sm">
              <FiPlus /> Add team
            </button>
          </div>
        </div>

        {unassignedCount > 0 && (
          <p className="text-sm text-amber-700 bg-amber-50 rounded-lg p-3 mb-4">
            {unassignedCount} player(s) fit no age group and are not on any score sheet. Edit their date
            of birth or widen the age groups.
          </p>
        )}

        {!teams?.length ? (
          <p className="text-center text-gray-500 py-10">
            No teams yet. {c.status === 'registration_open'
              ? 'Teams register from the home page.'
              : 'Set the status to “Registration open” so teams can register from the home page.'}
          </p>
        ) : (
          <div className="divide-y border rounded-lg">
            {teams.map((t, index) => {
              const open = expanded[t.registration_id]
              return (
                <div key={t.registration_id}>
                  <div className="flex items-center gap-3 px-4 py-3">
                    <button
                      onClick={() => setExpanded((e) => ({ ...e, [t.registration_id]: !open }))}
                      className="flex-1 flex items-center gap-3 text-left"
                      aria-expanded={!!open}
                    >
                      {open ? <FiChevronDown className="shrink-0" /> : <FiChevronRight className="shrink-0" />}
                      <span className="text-sm text-gray-400 w-6">{index + 1}.</span>
                      <span className="font-medium">{t.team_name}</span>
                      <span className="text-sm text-gray-500">{t.player_count} players</span>
                    </button>
                    <span className="hidden sm:inline text-xs font-mono text-gray-400">{t.team_code}</span>
                    <button onClick={() => setEditing(t)} className="p-2 text-gray-500 hover:text-primary-600" aria-label={`Edit ${t.team_name}`}>
                      <FiEdit2 />
                    </button>
                    <button
                      onClick={() => window.confirm(`Remove ${t.team_name} and its ${t.player_count} players?`) && deleteTeamMutation.mutate(t)}
                      className="p-2 text-gray-500 hover:text-red-600"
                      aria-label={`Delete ${t.team_name}`}
                    >
                      <FiTrash2 />
                    </button>
                  </div>
                  {open && (
                    <div className="px-4 pb-4 overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="table-header">
                            <th className="px-3 py-2">Player</th>
                            <th className="px-3 py-2">Boy / Girl</th>
                            <th className="px-3 py-2">Date of birth</th>
                            <th className="px-3 py-2">Age</th>
                            <th className="px-3 py-2">Age group</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {t.players.map((p) => (
                            <tr key={p.id}>
                              <td className="px-3 py-2">
                                {p.name}
                                {p.name_marathi && <span className="block text-xs text-gray-500" lang="mr">{p.name_marathi}</span>}
                              </td>
                              <td className="px-3 py-2">
                                {p.gender ? playerGenderLabel(p.gender) : <span className="text-amber-700">Not set</span>}
                              </td>
                              <td className="px-3 py-2">{p.date_of_birth ? formatDate(p.date_of_birth) : <span className="text-gray-400">–</span>}</td>
                              <td className="px-3 py-2">{p.age ?? <span className="text-gray-400">–</span>}</td>
                              <td className="px-3 py-2">
                                {p.age_group_name || <span className="text-amber-700">None</span>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {editing && (
        <Modal title={editing === 'new' ? 'Add team' : `Edit ${editing.team_name}`} onClose={() => setEditing(null)}>
          <TeamForm
            ageGroups={c.age_groups}
            referenceDate={c.effective_age_reference_date}
            maxPlayers={c.max_players_per_team}
            initial={editing === 'new' ? null : editing}
            onSubmit={(payload) => teamMutation.mutate({ team: editing, payload })}
            onCancel={() => setEditing(null)}
            submitting={teamMutation.isPending}
            submitLabel={editing === 'new' ? 'Add team' : 'Save team'}
            allowManualGroup
          />
        </Modal>
      )}
    </div>
  )
}

export default AdminCompetitionDetail
