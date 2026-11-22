import { useEffect, useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import { useAuthStore } from '../../store/authStore'
import { FiSave, FiPrinter, FiCheckCircle, FiRotateCcw, FiInfo } from 'react-icons/fi'

const categoryLabels = {
  pole: 'पुरलेला मल्लखांब (Pole)',
  rope: 'दोरीचा मल्लखांब (Rope)',
  hanging: 'लटकता मल्लखांब (Hanging)'
}

// Columns that make up सरासरी, in printed order
const JUDGE_FIELDS = [
  { field: 'head_judge_score', label: 'प्रमुख पंच' },
  { field: 'judge1_score', label: 'पंच क्र. 1' },
  { field: 'judge2_score', label: 'पंच क्र. 2' },
  { field: 'judge3_score', label: 'पंच क्र. 3' },
  { field: 'judge4_score', label: 'पंच क्र. 4' }
]

const num = (v) => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

// Mirrors server/src/utils/scoreSheet.js so the sheet totals live as you type.
// The server recomputes on save and its answer wins.
const averageOf = (row) => {
  const scores = JUDGE_FIELDS.map((c) => num(row[c.field])).filter((s) => s !== null)
  if (scores.length === 0) return null
  const counted = scores.length >= 3
    ? [...scores].sort((a, b) => a - b).slice(1, -1)
    : scores
  return counted.reduce((s, v) => s + v, 0) / counted.length
}

const finalOf = (row) => {
  const avg = averageOf(row)
  if (avg === null) return null
  return Math.max(0, avg - (num(row.deduction) || 0))
}

const fmt = (v, places = 2) => (v === null || v === undefined ? '' : Number(v).toFixed(places))

const ScoreSheet = () => {
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const isAdmin = user?.role === 'admin'

  const [competitionId, setCompetitionId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [teamId, setTeamId] = useState('')
  const [setType, setSetType] = useState('compulsory')
  const [sheet, setSheet] = useState(null)
  const [rows, setRows] = useState([])
  const [eventNumber, setEventNumber] = useState('')

  const { data: competitions } = useQuery({
    queryKey: ['competitions'],
    queryFn: async () => {
      const res = await api.get('/competitions')
      return res.data.data
    }
  })

  useEffect(() => {
    if (!competitionId && competitions?.length) setCompetitionId(String(competitions[0].id))
  }, [competitions, competitionId])

  const { data: options } = useQuery({
    queryKey: ['score-sheet-options', competitionId],
    queryFn: async () => {
      const res = await api.get(`/score-sheets/options/${competitionId}`)
      return res.data.data
    },
    enabled: !!competitionId
  })

  const categories = options?.categories || []
  const selectedCategory = categories.find(
    (c) => String(c.competition_category_id) === String(categoryId)
  )
  const teams = selectedCategory?.teams || []

  const openMutation = useMutation({
    mutationFn: (payload) => api.post('/score-sheets/open', payload),
    onSuccess: (res) => {
      const data = res.data.data
      setSheet(data)
      setRows(data.entries.map((e) => ({ ...e })))
      setEventNumber(data.event_number || '')
      if (data.entries.length === 0) {
        toast('No players are entered for this team in this category yet.', { icon: 'ℹ️' })
      } else {
        toast.success(res.data.message)
      }
    },
    onError: (error) => toast.error(error.response?.data?.message || 'Failed to open score sheet')
  })

  const saveMutation = useMutation({
    mutationFn: () => api.put(`/score-sheets/${sheet.id}`, {
      event_number: eventNumber || null,
      set_type: setType,
      entries: rows.map((r) => ({
        id: r.id,
        performance_time: r.performance_time || null,
        head_judge_score: r.head_judge_score,
        judge1_score: r.judge1_score,
        judge2_score: r.judge2_score,
        judge3_score: r.judge3_score,
        judge4_score: r.judge4_score,
        deduction: r.deduction
      }))
    }),
    onSuccess: (res) => {
      const data = res.data.data
      setSheet(data)
      setRows(data.entries.map((e) => ({ ...e })))
      toast.success(`Saved — संघिक गुण ${fmt(data.team_points)}`)
      queryClient.invalidateQueries({ queryKey: ['score-sheet-options'] })
    },
    onError: (error) => toast.error(error.response?.data?.message || 'Failed to save')
  })

  const statusMutation = useMutation({
    mutationFn: (status) => api.patch(`/score-sheets/${sheet.id}/status`, { status }),
    onSuccess: (res, status) => {
      toast.success(res.data.message)
      setSheet((s) => ({ ...s, status }))
    },
    onError: (error) => toast.error(error.response?.data?.message || 'Failed to update status')
  })

  const updateRow = (id, field, value) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)))
  }

  // संघिक गुण, live from the values on screen
  const teamPoints = useMemo(() => {
    const finals = rows.map(finalOf).filter((f) => f !== null)
    return finals.length ? finals.reduce((s, v) => s + v, 0) : null
  }, [rows])

  const locked = sheet?.status === 'submitted' && !isAdmin
  const canOpen = competitionId && categoryId && teamId

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-bold">गुणपत्रिका — Score Sheet</h1>
          <p className="text-gray-500">
            Pick a team, age group and category to open its sheet. Players are filled in
            from the competition entries.
          </p>
        </div>
      </div>

      {/* Sheet picker */}
      <div className="card grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 print:hidden">
        <div>
          <label className="label">Competition</label>
          <select
            value={competitionId}
            onChange={(e) => { setCompetitionId(e.target.value); setCategoryId(''); setTeamId(''); setSheet(null) }}
            className="input"
          >
            <option value="">Select</option>
            {competitions?.map((c) => (
              <option key={c.id} value={c.id}>{c.competition_name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">Category &amp; Age Group</label>
          <select
            value={categoryId}
            onChange={(e) => { setCategoryId(e.target.value); setTeamId(''); setSheet(null) }}
            className="input"
            disabled={!competitionId}
          >
            <option value="">Select</option>
            {categories.map((c) => (
              <option key={c.competition_category_id} value={c.competition_category_id}>
                {c.category} — {c.age_group_name.trim()} ({c.entry_count} entries)
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">संघाचे नांव (Team)</label>
          <select
            value={teamId}
            onChange={(e) => { setTeamId(e.target.value); setSheet(null) }}
            className="input"
            disabled={!categoryId}
          >
            <option value="">Select</option>
            {teams.map((t) => (
              <option key={t.team_id} value={t.team_id}>
                {t.team_name} ({t.player_count})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">संच (Set)</label>
          <select
            value={setType}
            onChange={(e) => { setSetType(e.target.value); setSheet(null) }}
            className="input"
          >
            {(options?.setTypes || []).map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>

        <div className="flex items-end">
          <button
            onClick={() => openMutation.mutate({
              competition_id: parseInt(competitionId, 10),
              competition_category_id: parseInt(categoryId, 10),
              team_id: parseInt(teamId, 10),
              set_type: setType
            })}
            disabled={!canOpen || openMutation.isPending}
            className="btn btn-primary w-full"
          >
            {openMutation.isPending ? 'Opening...' : 'Open Sheet'}
          </button>
        </div>
      </div>

      {categoryId && teams.length === 0 && (
        <div className="card flex items-start gap-2 text-sm text-amber-700 bg-amber-50 print:hidden">
          <FiInfo className="w-4 h-4 mt-0.5 shrink-0" />
          No team has players entered in this category yet. Add entries from the
          competition's registration page and the sheet will fill in automatically.
        </div>
      )}

      {/* The sheet itself */}
      {sheet && (
        <div className="card space-y-4">
          {/* Printed header */}
          <div className="text-center border-b pb-4">
            <h2 className="text-lg font-bold">{sheet.competition_name}</h2>
            <p className="text-sm text-gray-500">
              {[sheet.venue, sheet.city].filter(Boolean).join(', ')}
              {sheet.start_date ? ` • ${new Date(sheet.start_date).toLocaleDateString()}` : ''}
            </p>
            <p className="font-semibold mt-1">गुणपत्रिका</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-gray-500">संघाचे नांव</span>
              <p className="font-medium">{sheet.team_name}</p>
            </div>
            <div>
              <span className="text-gray-500">वयोगट</span>
              <p className="font-medium">{sheet.age_group_name?.trim()}</p>
            </div>
            <div>
              <span className="text-gray-500">मल्लखांब प्रकार</span>
              <p className="font-medium">{categoryLabels[sheet.category] || sheet.category}</p>
            </div>
            <div>
              <label className="text-gray-500 block">स्पर्धा क्र.</label>
              <input
                value={eventNumber}
                onChange={(e) => setEventNumber(e.target.value)}
                className="input py-1 text-sm"
                placeholder="1अ / 2 / 3"
                maxLength={20}
                disabled={locked}
              />
            </div>
          </div>

          {sheet.entries.length === 0 ? (
            <div className="text-center py-10 text-gray-500">
              No players entered for {sheet.team_name} in this category.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border px-2 py-2 w-12">क्र.</th>
                    <th className="border px-2 py-2 text-left min-w-[11rem]">खेळाडूचे नांव</th>
                    <th className="border px-2 py-2 w-20">वेळ</th>
                    {JUDGE_FIELDS.map((c) => (
                      <th key={c.field} className="border px-2 py-2 w-24">{c.label}</th>
                    ))}
                    <th className="border px-2 py-2 w-20 bg-gray-200">सरासरी</th>
                    <th className="border px-2 py-2 w-24">गुण कपात</th>
                    <th className="border px-2 py-2 w-24 bg-gray-200">अंतिम गुण</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => (
                    <tr key={row.id} className="hover:bg-gray-50">
                      <td className="border px-2 py-1 text-center text-gray-500">{index + 1}</td>
                      <td className="border px-2 py-1">
                        <div className="font-medium">{row.player_name}</div>
                        {row.registration_number && (
                          <div className="text-xs text-gray-400">{row.registration_number}</div>
                        )}
                      </td>
                      <td className="border px-1 py-1">
                        <input
                          value={row.performance_time || ''}
                          onChange={(e) => updateRow(row.id, 'performance_time', e.target.value)}
                          className="w-full px-1 py-1 text-center border-0 focus:ring-1 focus:ring-primary-400 rounded"
                          placeholder="mm:ss"
                          maxLength={10}
                          disabled={locked}
                        />
                      </td>
                      {JUDGE_FIELDS.map((c) => (
                        <td key={c.field} className="border px-1 py-1">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            max={sheet.max_judge_score}
                            value={row[c.field] ?? ''}
                            onChange={(e) => updateRow(row.id, c.field, e.target.value)}
                            className="w-full px-1 py-1 text-center border-0 focus:ring-1 focus:ring-primary-400 rounded"
                            disabled={locked}
                          />
                        </td>
                      ))}
                      <td className="border px-2 py-1 text-center font-medium bg-gray-50">
                        {fmt(averageOf(row))}
                      </td>
                      <td className="border px-1 py-1">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={row.deduction ?? ''}
                          onChange={(e) => updateRow(row.id, 'deduction', e.target.value)}
                          className="w-full px-1 py-1 text-center border-0 focus:ring-1 focus:ring-primary-400 rounded"
                          disabled={locked}
                        />
                      </td>
                      <td className="border px-2 py-1 text-center font-semibold bg-gray-50">
                        {fmt(finalOf(row))}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-gray-100 font-semibold">
                    <td className="border px-2 py-2" colSpan={JUDGE_FIELDS.length + 5}>
                      <span className="float-right pr-2">संघिक गुण</span>
                    </td>
                    <td className="border px-2 py-2 text-center text-primary-700">
                      {fmt(teamPoints)}
                    </td>
                  </tr>
                </tbody>
              </table>

              <p className="text-xs text-gray-500 mt-2">
                सरासरी drops the highest and lowest of the five judge scores and averages the
                rest. अंतिम गुण = सरासरी − गुण कपात. संघिक गुण is the sum of all अंतिम गुण.
              </p>
            </div>
          )}

          {/* Signatures, as on the paper sheet */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t text-sm text-gray-500">
            {['प्रमुख पंच', 'पंच क्र. 1', 'पंच क्र. 2', 'पंच क्र. 3',
              'पंच क्र. 4', 'गुणलेखक', 'वेळाधिकारी', 'स्पर्धा संचालक'].map((label) => (
              <div key={label}>
                <div className="border-b border-gray-400 h-8" />
                <p className="mt-1">{label}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-3 pt-2 print:hidden">
            <button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || locked || sheet.entries.length === 0}
              className="btn btn-primary flex items-center gap-2"
            >
              <FiSave className="w-4 h-4" />
              {saveMutation.isPending ? 'Saving...' : 'Save Scores'}
            </button>

            {sheet.status === 'draft' ? (
              <button
                onClick={() => statusMutation.mutate('submitted')}
                disabled={statusMutation.isPending || sheet.entries.length === 0}
                className="btn btn-outline flex items-center gap-2"
              >
                <FiCheckCircle className="w-4 h-4" /> Submit
              </button>
            ) : (
              <>
                <span className="inline-flex items-center gap-1 text-green-700 bg-green-50 rounded-lg px-3 py-2 text-sm font-medium">
                  <FiCheckCircle className="w-4 h-4" /> Submitted
                </span>
                {isAdmin && (
                  <button
                    onClick={() => statusMutation.mutate('draft')}
                    disabled={statusMutation.isPending}
                    className="btn btn-outline flex items-center gap-2"
                  >
                    <FiRotateCcw className="w-4 h-4" /> Reopen
                  </button>
                )}
              </>
            )}

            <button onClick={() => window.print()} className="btn btn-outline flex items-center gap-2">
              <FiPrinter className="w-4 h-4" /> Print
            </button>
          </div>

          {locked && (
            <p className="text-sm text-amber-700 bg-amber-50 rounded-lg p-3 print:hidden">
              This sheet has been submitted and is read-only. An admin can reopen it.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export default ScoreSheet
