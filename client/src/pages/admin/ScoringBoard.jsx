import { useMemo } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { FiArrowLeft, FiArrowRight, FiBarChart2, FiCheckCircle } from 'react-icons/fi'
import api from '../../services/api'
import ScoreSheetEditor from '../../components/ScoreSheetEditor'
import { APPARATUS_BADGE, fmtScore } from '../../utils/competition'

// Pick an age group, see one tile per apparatus x team, open a sheet to score it.
const ScoringBoard = () => {
  const { id } = useParams()
  const [params, setParams] = useSearchParams()

  const { data: competition } = useQuery({
    queryKey: ['admin-competition', id],
    queryFn: async () => (await api.get(`/admin/competitions/${id}`)).data.data
  })

  const { data: board, isLoading } = useQuery({
    queryKey: ['scoring-board', id],
    queryFn: async () => (await api.get(`/admin/competitions/${id}/scoring-board`)).data.data
  })

  const groupId = params.get('group') || (board?.[0] ? String(board[0].age_group_id) : null)
  const sheetId = params.get('sheet')
  const group = board?.find((g) => String(g.age_group_id) === groupId)

  // Flat order of every sheet in the group, for "next sheet"
  const order = useMemo(
    () => (group?.apparatus || []).flatMap((a) => a.sheets.map((s) => s.id)),
    [group]
  )
  const nextSheet = sheetId ? order[order.indexOf(Number(sheetId)) + 1] : null

  const select = (next) => {
    const merged = { group: groupId, ...next }
    setParams(Object.fromEntries(Object.entries(merged).filter(([, v]) => v)))
  }

  if (isLoading) return <div className="text-center py-16 text-gray-500">Loading…</div>

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4 print:hidden">
        <div>
          <Link to={`/admin/competitions/${id}`} className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-2">
            <FiArrowLeft /> {competition?.competition_name || 'Competition'}
          </Link>
          <h1 className="text-2xl font-bold">Score sheets</h1>
          <p className="text-gray-500">One sheet per age group, apparatus and team. Scores autosave and results update live.</p>
        </div>
        <Link to={`/admin/competitions/${id}/results`} className="btn btn-outline inline-flex items-center gap-2">
          <FiBarChart2 /> Results
        </Link>
      </div>

      {!board?.length ? (
        <div className="card text-center py-12 text-gray-500">This competition has no age groups yet.</div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 print:hidden" role="tablist">
            {board.map((g) => {
              const total = g.apparatus.reduce((s, a) => s + a.sheets.reduce((x, sh) => x + sh.player_count, 0), 0)
              const scored = g.apparatus.reduce((s, a) => s + a.sheets.reduce((x, sh) => x + sh.scored_count, 0), 0)
              const active = String(g.age_group_id) === groupId
              return (
                <button
                  key={g.age_group_id}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setParams({ group: String(g.age_group_id) })}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    active ? 'bg-primary-600 text-white' : 'bg-white border text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {g.group_name}
                  <span className={`ml-2 text-xs ${active ? 'text-primary-100' : 'text-gray-400'}`}>{scored}/{total}</span>
                </button>
              )
            })}
          </div>

          {group && (
            <div className="grid gap-4 lg:grid-cols-3 print:hidden">
              {group.apparatus.map((a) => (
                <div key={a.competition_category_id} className="card p-4">
                  <h2 className="font-semibold mb-3 flex items-center gap-2">
                    <span className={`text-xs rounded-full px-2 py-0.5 ${APPARATUS_BADGE[a.apparatus]}`}>{a.label}</span>
                    <span className="text-sm text-gray-500 font-normal">{a.sheets.length} team{a.sheets.length === 1 ? '' : 's'}</span>
                  </h2>
                  {a.sheets.length === 0 ? (
                    <p className="text-sm text-gray-400">No players in this age group yet.</p>
                  ) : (
                    <ul className="space-y-2">
                      {a.sheets.map((s) => {
                        const active = String(s.id) === sheetId
                        const done = s.player_count > 0 && s.scored_count === s.player_count
                        return (
                          <li key={s.id}>
                            <button
                              onClick={() => select({ sheet: String(s.id) })}
                              className={`w-full text-left rounded-lg border px-3 py-2 transition-colors ${
                                active ? 'border-primary-500 bg-primary-50' : 'hover:bg-gray-50'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-medium truncate">{s.team_name}</span>
                                {s.status === 'submitted'
                                  ? <FiCheckCircle className="text-green-600 shrink-0" title="Submitted" />
                                  : done && <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" title="All scored" />}
                              </div>
                              <div className="flex justify-between text-xs text-gray-500 mt-0.5">
                                <span>{s.scored_count}/{s.player_count} scored</span>
                                <span className="tabular-nums">{s.team_points === null ? '' : `Team ${fmtScore(s.team_points)}`}</span>
                              </div>
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}

          {sheetId ? (
            <div className="space-y-3">
              <ScoreSheetEditor key={sheetId} sheetId={sheetId} />
              {nextSheet && (
                <div className="flex justify-end print:hidden">
                  <button
                    onClick={() => { select({ sheet: String(nextSheet) }); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
                    className="btn btn-outline inline-flex items-center gap-2"
                  >
                    Next sheet <FiArrowRight />
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="card text-center py-10 text-gray-500 print:hidden">Pick a team above to open its score sheet.</div>
          )}
        </>
      )}
    </div>
  )
}

export default ScoringBoard
