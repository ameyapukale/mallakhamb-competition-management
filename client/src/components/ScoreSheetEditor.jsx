import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import { FiCheckCircle, FiPlus, FiPrinter, FiRotateCcw, FiSave, FiTrash2, FiX } from 'react-icons/fi'
import api from '../services/api'
import { apparatusLabel, errorMessage, fmtScore, playerGenderLabel } from '../utils/competition'

// The five judge columns, in printed order (mirrors server/src/utils/scoreSheet.js)
const JUDGE_FIELDS = [
  { field: 'head_judge_score', label: 'प्रमुख पंच', short: 'Head' },
  { field: 'judge1_score', label: 'पंच क्र.१', short: 'J1' },
  { field: 'judge2_score', label: 'पंच क्र.२', short: 'J2' },
  { field: 'judge3_score', label: 'पंच क्र.३', short: 'J3' },
  { field: 'judge4_score', label: 'पंच क्र.४', short: 'J4' }
]
const INPUT_FIELDS = ['performance_time', ...JUDGE_FIELDS.map((c) => c.field), 'deduction']

// ---- The printed पंचांचे गुणपत्रक form ---------------------------------------
const MIN_ROWS = 6
const APPARATUS_LETTER = { pole: 'P', rope: 'R', hanging: 'H' }
// Printed in this order on the form; the sheet's own apparatus is circled
const APPARATUS_MR = [
  { value: 'pole', label: 'पुरलेला मल्लखांब' },
  { value: 'hanging', label: 'टांगता मल्लखांब' },
  { value: 'rope', label: 'दोरीचा मल्लखांब' }
]
const MR_DIGITS = '०१२३४५६७८९'
const toMarathiDigits = (v) => String(v).replace(/\d/g, (d) => MR_DIGITS[d])

// "१४ वर्षांखालील" (under 14) / "१८ वर्षांवरील" (18 and above), from the group's ages
const ageGroupLabel = (sheet) => {
  const max = sheet.age_group_max_age
  const min = sheet.age_group_min_age
  if (max !== null && max !== undefined) return `${toMarathiDigits(Number(max) + 1)} वर्षांखालील`
  if (min !== null && min !== undefined) return `${toMarathiDigits(min)} वर्षांवरील`
  return sheet.age_group_name
}

const DEFAULT_EVENT_NO = '१ अ,ब/ २ / ३'

// A choice printed on the form (मुले / मुली, the apparatus); clicking it circles it
const Circled = ({ on, colour, children, onClick, disabled }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    aria-pressed={on}
    className={`${on ? `rounded-full border-2 ${colour}` : 'border-2 border-transparent'} px-1.5 font-bold enabled:hover:bg-gray-100 print:hover:bg-transparent rounded-full`}
  >
    {children}
  </button>
)

// Text written on a line of the form: looks like the printed line, but can be typed in
const lineInput = 'min-w-0 border-0 border-b border-black bg-transparent px-1 py-0 text-blue-900 focus:outline-none focus:ring-0 focus:border-primary-500 focus:border-b-2 disabled:text-blue-900'

// Name lines for the judges and officials, arranged as on the form
const Signatures = ({ items, form, onChange, disabled }) => (
  <div className="space-y-1">
    {items.map(({ key, label }) => (
      <div key={key} className="flex items-end gap-3">
        <span className="whitespace-nowrap">{label}</span>
        <input
          value={form[key] ?? ''}
          onChange={(e) => onChange(key, e.target.value)}
          disabled={disabled}
          maxLength={150}
          aria-label={`${label} name`}
          className={`${lineInput} flex-1 font-normal text-base`}
        />
      </div>
    ))}
  </div>
)

const num = (v) => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

// The four panel judges. The head judge (प्रमुख पंच) is not part of the average.
// Mirrors droppedJudges / calculateAverage in server/src/utils/scoreSheet.js.
const PANEL_FIELDS = ['judge1_score', 'judge2_score', 'judge3_score', 'judge4_score']

// The highest and lowest of judges 1–4 (circled on the sheet). Needs 3+ panel
// scores; with ties the first judge holding that score is the one circled.
const droppedJudges = (row) => {
  const present = PANEL_FIELDS.map((field) => ({ field, score: num(row[field]) })).filter((s) => s.score !== null)
  if (present.length < 3) return { high: null, low: null }
  let low = present[0]
  for (const s of present) if (s.score < low.score) low = s
  let high = null
  for (const s of present) {
    if (s.field !== low.field && (!high || s.score > high.score)) high = s
  }
  return { high: high.field, low: low.field }
}

// सरासरी: strike out the highest and lowest of judges 1–4, average the other two
const averageOf = (row) => {
  const { high, low } = droppedJudges(row)
  const counted = PANEL_FIELDS.filter((f) => f !== high && f !== low).map((f) => num(row[f])).filter((s) => s !== null)
  if (counted.length === 0) return null
  return Math.round((counted.reduce((s, v) => s + v, 0) / counted.length) * 1000) / 1000
}

// अंतिम गुण: सरासरी − गुण कपात, never below zero
const finalOf = (row) => {
  const avg = averageOf(row)
  return avg === null ? null : Math.max(0, avg - (num(row.deduction) || 0))
}

const rowProblem = (row, max) => {
  if (row._nameEdited && !String(row.player_name || '').trim() && !String(row.name_marathi || '').trim()) {
    return "Enter the player's name"
  }
  for (const c of JUDGE_FIELDS) {
    const v = row[c.field]
    if (v === '' || v === null || v === undefined) continue
    const n = num(v)
    if (n === null || n < 0 || n > max) return `${c.short}: score must be 0–${max}`
  }
  const d = row.deduction
  if (d !== '' && d !== null && d !== undefined && (num(d) === null || num(d) < 0)) return 'Deduction cannot be negative'
  return null
}

// What PUT /score-sheets/:id expects for each row
const toEntries = (rows) => rows.map((r) => ({
  id: r.id,
  performance_time: r.performance_time || null,
  ...Object.fromEntries(JUDGE_FIELDS.map((c) => [c.field, num(r[c.field])])),
  deduction: num(r.deduction) ?? 0,
  // Names go along only when they were changed on this sheet
  ...(r._nameEdited ? { player_name: r.player_name || '', name_marathi: r.name_marathi || '' } : {})
}))

const toPayload = (rows, form) => ({ entries: toEntries(rows), form_details: form })

const cellInput = 'w-full px-1 py-1.5 text-center border-0 bg-transparent rounded focus:ring-2 focus:ring-primary-400 print:focus:ring-0 disabled:bg-transparent tabular-nums print:p-0 print:placeholder-transparent'

/**
 * One गुणपत्रिका: a team's players for one age group + apparatus. Totals update as
 * you type and the sheet autosaves shortly after you stop, so the results page
 * follows along live.
 */
const ScoreSheetEditor = ({ sheetId, onSaved, isAdmin = true }) => {
  const queryClient = useQueryClient()
  const [rows, setRows] = useState([])
  const [form, setForm] = useState({})
  const [adding, setAdding] = useState(null) // { name, name_marathi, gender } while the add-player row is open
  const [dirty, setDirty] = useState(false)
  const [savedAt, setSavedAt] = useState(null)
  const version = useRef(0)

  const { data: sheet, isLoading } = useQuery({
    queryKey: ['score-sheet', sheetId],
    queryFn: async () => (await api.get(`/score-sheets/${sheetId}`)).data.data,
    refetchOnWindowFocus: false
  })

  // Rows and form text exactly as the server has them
  const loadSheet = (data) => {
    // An unscored row shows an empty गुण कपात, as on the paper form
    setRows(data.entries.map((e) => ({
      ...e,
      deduction: e.final_score === null && !Number(e.deduction) ? '' : e.deduction
    })))
    setForm(data.form_details || {})
    setDirty(false)
  }

  // Load whenever a different sheet arrives
  useEffect(() => {
    if (sheet) loadSheet(sheet)
  }, [sheet?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const max = sheet?.max_judge_score ?? 10
  const problems = useMemo(() => Object.fromEntries(rows.map((r) => [r.id, rowProblem(r, max)])), [rows, max])
  const hasProblems = Object.values(problems).some(Boolean)
  const locked = sheet?.status === 'submitted' && !isAdmin

  const saveMutation = useMutation({
    mutationFn: ({ payloadRows, payloadForm }) => api.put(`/score-sheets/${sheetId}`, toPayload(payloadRows, payloadForm)),
    onSuccess: (res, { savedVersion }) => {
      const server = res.data.data
      // Keep what's being typed; take only the server's derived values
      const derived = new Map(server.entries.map((e) => [e.id, e]))
      setRows((prev) => prev.map((r) => ({
        ...r,
        average_score: derived.get(r.id)?.average_score ?? null,
        final_score: derived.get(r.id)?.final_score ?? null
      })))
      if (savedVersion === version.current) setDirty(false)
      setSavedAt(new Date())
      queryClient.setQueryData(['score-sheet', sheetId], (old) => old && {
        ...old, team_points: server.team_points, form_details: server.form_details
      })
      queryClient.invalidateQueries({ queryKey: ['score-sheet'], predicate: (q) => q.queryKey[1] !== sheetId })
      queryClient.invalidateQueries({ queryKey: ['scoring-board'] })
      queryClient.invalidateQueries({ queryKey: ['results'] })
      onSaved?.()
    },
    onError: (error) => toast.error(errorMessage(error, 'Failed to save scores'))
  })

  const save = () => {
    if (hasProblems || locked) return
    saveMutation.mutate({ payloadRows: rows, payloadForm: form, savedVersion: version.current })
  }

  // Autosave ~1s after the last keystroke
  useEffect(() => {
    if (!dirty || hasProblems || locked) return undefined
    const t = setTimeout(save, 1000)
    return () => clearTimeout(t)
  }, [rows, form, dirty, hasProblems, locked]) // eslint-disable-line react-hooks/exhaustive-deps

  // Leaving the sheet (switching team, navigating away) before the autosave fired:
  // flush the pending edits instead of dropping them.
  const pending = useRef(null)
  pending.current = dirty && !hasProblems && !locked ? { rows, form } : null
  useEffect(() => () => {
    const unsaved = pending.current
    if (!unsaved) return
    api.put(`/score-sheets/${sheetId}`, toPayload(unsaved.rows, unsaved.form)).then(() => {
      queryClient.invalidateQueries({ queryKey: ['score-sheet', sheetId] })
      queryClient.invalidateQueries({ queryKey: ['scoring-board'] })
      queryClient.invalidateQueries({ queryKey: ['results'] })
    }).catch(() => toast.error('Some unsaved scores could not be saved — reopen the sheet to check'))
  }, [sheetId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Warn before closing the tab with unsaved scores
  useEffect(() => {
    if (!dirty) return undefined
    const warn = (e) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const statusMutation = useMutation({
    mutationFn: (status) => api.patch(`/score-sheets/${sheetId}/status`, { status }),
    onSuccess: (res) => {
      toast.success(res.data.message)
      queryClient.invalidateQueries({ queryKey: ['score-sheet', sheetId] })
      queryClient.invalidateQueries({ queryKey: ['scoring-board'] })
    },
    onError: (error) => toast.error(errorMessage(error, 'Failed to update sheet'))
  })

  const updateRow = (id, field, value) => {
    version.current += 1
    setDirty(true)
    const isName = field === 'player_name' || field === 'name_marathi'
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value, ...(isName ? { _nameEdited: true } : {}) } : r)))
  }

  const updateForm = (key, value) => {
    version.current += 1
    setDirty(true)
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  // Add a player: save what is on the sheet first, then reload it with the new row
  const addMutation = useMutation({
    mutationFn: async (player) => {
      if (dirty && !hasProblems && !locked) await api.put(`/score-sheets/${sheetId}`, toPayload(rows, form))
      return api.post(`/score-sheets/${sheetId}/players`, {
        name: player.name.trim(),
        name_marathi: player.name_marathi.trim(),
        ...(player.gender ? { gender: player.gender } : {})
      })
    },
    onSuccess: (res) => {
      const server = res.data.data
      queryClient.setQueryData(['score-sheet', sheetId], server)
      loadSheet(server)
      setAdding(null)
      toast.success('Player added — they are on this team\'s other apparatus sheets of this age group too')
      queryClient.invalidateQueries({ queryKey: ['score-sheet'], predicate: (q) => q.queryKey[1] !== sheetId })
      queryClient.invalidateQueries({ queryKey: ['scoring-board'] })
      queryClient.invalidateQueries({ queryKey: ['results'] })
      setTimeout(() => document.getElementById(`cell-${server.entries.length - 1}-performance_time`)?.focus(), 50)
    },
    onError: (error) => toast.error(errorMessage(error, 'Failed to add the player'))
  })

  // Remove a player: save what is on the sheet first (minus that row), then reload
  const [sheetGone, setSheetGone] = useState(false)
  const removeMutation = useMutation({
    mutationFn: async (row) => {
      const others = rows.filter((r) => r.id !== row.id)
      if (dirty && !locked && others.every((r) => !rowProblem(r, max))) {
        await api.put(`/score-sheets/${sheetId}`, toPayload(others, form))
      }
      return api.delete(`/score-sheets/${sheetId}/players/${row.player_id}`)
    },
    onSuccess: (res) => {
      const server = res.data.data
      toast.success(res.data.message)
      queryClient.invalidateQueries({ queryKey: ['score-sheet'], predicate: (q) => q.queryKey[1] !== sheetId })
      queryClient.invalidateQueries({ queryKey: ['scoring-board'] })
      queryClient.invalidateQueries({ queryKey: ['results'] })
      if (!server) {
        setDirty(false)
        setSheetGone(true)
        return
      }
      queryClient.setQueryData(['score-sheet', sheetId], server)
      loadSheet(server)
    },
    onError: (error) => toast.error(errorMessage(error, 'Failed to remove the player'))
  })

  const removePlayer = (row) => {
    const name = row.name_marathi || row.player_name || 'this player'
    const hasScores = INPUT_FIELDS.some((f) => f !== 'deduction' && row[f] !== '' && row[f] !== null && row[f] !== undefined)
    const message = `Remove ${name} from ${sheet.team_name}?\n\n` +
      `They will be taken off this team's ${sheet.age_group_name} sheets for every apparatus (not only this one).` +
      (hasScores ? '\n\nTheir scores on those sheets will be deleted.' : '')
    if (window.confirm(message)) removeMutation.mutate(row)
  }

  // Marathi spelling suggested from the English name, as on the team form
  const suggestMarathi = async (english) => {
    if (!english.trim()) return
    try {
      const { data } = await api.post('/public/transliterate', { text: english.trim() })
      setAdding((a) => (a && !a.name_marathi ? { ...a, name_marathi: data.data.text } : a))
    } catch {
      // It can still be typed by hand
    }
  }

  // Enter moves down to the same column on the next row, like a paper sheet
  const onKeyDown = (e, rowIndex, field) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    const next = document.getElementById(`cell-${rowIndex + (e.shiftKey ? -1 : 1)}-${field}`)
    next?.focus()
    next?.select?.()
  }

  // Team score: every final, or only the best N when the competition says so.
  // `counted` holds the row ids that make up the team score (ties at the cut-off
  // go to the earlier row, which does not change the total).
  const bestCount = Number(sheet?.team_best_count) > 0 ? Number(sheet.team_best_count) : null
  const { teamPoints, counted } = useMemo(() => {
    const scored = rows.map((r) => ({ id: r.id, final: finalOf(r) })).filter((r) => r.final !== null)
    const top = bestCount ? [...scored].sort((a, b) => b.final - a.final).slice(0, bestCount) : scored
    return {
      teamPoints: top.length ? top.reduce((s, r) => s + r.final, 0) : null,
      counted: new Set(top.map((r) => r.id))
    }
  }, [rows, bestCount])


  if (sheetGone) {
    return <div className="card text-center py-10 text-gray-500">This sheet has no players left, so it was removed. Pick another sheet above.</div>
  }
  if (isLoading || !sheet) return <div className="card text-center py-10 text-gray-500">Loading sheet…</div>

  const saveState = saveMutation.isPending ? 'Saving…'
    : hasProblems ? 'Fix the highlighted scores to save'
      : dirty ? 'Unsaved changes'
        : savedAt ? `Saved ${savedAt.toLocaleTimeString()}` : 'All changes saved'

  // The paper sheet always shows at least six rows
  const blankRows = Math.max(0, MIN_ROWS - rows.length)
  // What the form shows: the sheet's own text where it was edited, else the competition's values
  const shownGender = form.gender || sheet.age_group_gender
  const shownApparatus = form.apparatus || sheet.category
  const circleColour = shownApparatus === 'rope' ? 'border-red-700' : 'border-blue-800'
  const isMixed = sheet.age_group_gender === 'mixed'
  const th = 'border-2 border-black px-1 py-1 font-bold leading-tight'
  const td = 'border-2 border-black'

  return (
    <div className="space-y-3">
      {/* Screen-only bar: which competition and the sheet's status */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-gray-600 print:hidden">
        <span className="font-medium text-gray-800">{sheet.competition_name}</span>
        <span>
          {sheet.age_group_name} · {apparatusLabel(sheet.category)} ·{' '}
          <span className={sheet.status === 'submitted' ? 'text-green-700 font-medium' : ''}>
            {sheet.status === 'submitted' ? 'Submitted' : 'Draft'}
          </span>
        </span>
      </div>

      {/* The पंचांचे गुणपत्रक, laid out like the printed form */}
      <div style={{ "--sheet-row-h": rows.length > 6 ? "10.5mm" : "12.5mm" }} className="score-sheet overflow-x-auto bg-white border-[3px] border-black px-6 pt-4 pb-5 text-black" lang="mr">
        <div className="min-w-[60rem] print:min-w-0">
          <h2 className="text-center text-xl font-bold">पंचांचे गुणपत्रक</h2>

          <div className="mt-2 flex items-end gap-10 pl-12">
            <label className="flex items-end gap-2 flex-1">
              <span className="font-bold text-lg whitespace-nowrap">संघाचे नाव :</span>
              <input
                value={form.team_name ?? sheet.team_name}
                onChange={(e) => updateForm('team_name', e.target.value)}
                disabled={locked} maxLength={150}
                className={`${lineInput} flex-1 text-lg`}
              />
            </label>
            <label className="flex items-end gap-2 w-[22rem]">
              <span className="font-bold text-lg whitespace-nowrap">वयोगट :</span>
              <input
                value={form.age_label ?? ageGroupLabel(sheet)}
                onChange={(e) => updateForm('age_label', e.target.value)}
                disabled={locked} maxLength={150}
                className={`${lineInput} flex-1 text-lg`}
              />
            </label>
          </div>

          <div className="mt-2 flex items-center gap-8 font-bold text-lg">
            <span className="border-2 border-black px-2 font-sans leading-tight">{APPARATUS_LETTER[shownApparatus] || '?'}</span>
            <span>
              <Circled on={shownGender === 'male'} colour="border-blue-800" disabled={locked} onClick={() => updateForm('gender', 'male')}>मुले</Circled>
              {' / '}
              <Circled on={shownGender === 'female'} colour="border-blue-800" disabled={locked} onClick={() => updateForm('gender', 'female')}>मुली</Circled>
            </span>
            <span>
              {APPARATUS_MR.map((a, i) => (
                <span key={a.value}>
                  {i > 0 && '/'}
                  <Circled on={shownApparatus === a.value} colour={circleColour} disabled={locked} onClick={() => updateForm('apparatus', a.value)}>
                    {a.label}
                  </Circled>
                </span>
              ))}
            </span>
            <label className="ml-auto flex items-end gap-1">
              <span>दि.</span>
              <input
                value={form.date ?? ''}
                onChange={(e) => updateForm('date', e.target.value)}
                disabled={locked} maxLength={30}
                placeholder="     /     / २०"
                aria-label="Date"
                className={`${lineInput} w-36 text-center placeholder:text-black print:!border-transparent`}
              />
            </label>
          </div>
          <label className="flex justify-center items-end gap-1 font-bold">
            <span>स्पर्धा क्र.</span>
            <input
              value={form.event_no ?? DEFAULT_EVENT_NO}
              onChange={(e) => updateForm('event_no', e.target.value)}
              disabled={locked} maxLength={60}
              className={`${lineInput} w-44 text-center font-bold print:!border-transparent`}
            />
          </label>

          <table className="mt-2 w-full table-fixed border-collapse text-center">
            <colgroup>
              <col style={{ width: '5%' }} /><col style={{ width: '21%' }} /><col style={{ width: '8%' }} />
              {JUDGE_FIELDS.map((c) => <col key={c.field} style={{ width: '8%' }} />)}
              <col style={{ width: '9%' }} /><col style={{ width: '8%' }} /><col style={{ width: '9%' }} />
            </colgroup>
            <thead>
              <tr>
                <th className={th}>अनु.</th>
                <th className={th}>खेळाडूचे नाव</th>
                <th className={th}>वेळ</th>
                {JUDGE_FIELDS.map((c) => <th key={c.field} className={th}>{c.label}</th>)}
                <th className={th}>सरासरी</th>
                <th className={th}>गुण कपात</th>
                <th className={th}>अंतिम गुण</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const dropped = droppedJudges(row)
                return (
                  <tr key={row.id} className={problems[row.id] ? 'bg-red-50 print:bg-transparent' : ''}>
                    <td className={`${td} px-1 font-sans`}>
                      <div className="flex items-center justify-center gap-1">
                        <span>{index + 1}.</span>
                        {!locked && (
                          <button
                            type="button"
                            onClick={() => removePlayer(row)}
                            disabled={removeMutation.isPending}
                            className="text-gray-400 hover:text-red-600 p-0.5 rounded print:hidden"
                            title="Remove this player"
                            aria-label={`Remove ${row.player_name}`}
                          >
                            <FiTrash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                    <td className={`${td} px-1 py-0.5 text-left`}>
                      <div className="flex items-center">
                        <input
                          value={row.name_marathi ?? ''}
                          onChange={(e) => updateRow(row.id, 'name_marathi', e.target.value)}
                          disabled={locked} maxLength={100}
                          placeholder={row.player_name || 'नाव'}
                          lang="mr"
                          aria-label="Player name (Marathi)"
                          className="w-full min-w-0 border-0 bg-transparent px-1 py-0.5 text-blue-900 font-medium rounded focus:ring-2 focus:ring-primary-400 print:focus:ring-0 placeholder:text-blue-900/70 print:placeholder:text-blue-900"
                        />
                        {isMixed && row.gender && (
                          <span className="ml-1 text-xs text-gray-500 whitespace-nowrap">({playerGenderLabel(row.gender)})</span>
                        )}
                      </div>
                      <input
                        value={row.player_name ?? ''}
                        onChange={(e) => updateRow(row.id, 'player_name', e.target.value)}
                        disabled={locked} maxLength={100}
                        placeholder="English name"
                        lang="en"
                        aria-label="Player name (English)"
                        className="w-full border-0 bg-transparent px-1 py-0 text-xs text-gray-500 rounded focus:ring-2 focus:ring-primary-400 print:focus:ring-0 print:hidden"
                      />
                      {problems[row.id] && <div className="px-1 text-xs text-red-600 print:hidden">{problems[row.id]}</div>}
                    </td>
                    {INPUT_FIELDS.map((field) => {
                      const isTime = field === 'performance_time'
                      const n = num(row[field])
                      const bad = !isTime && row[field] !== '' && row[field] !== null && row[field] !== undefined &&
                        (n === null || n < 0 || (field !== 'deduction' && n > max))
                      const circled = field === dropped.high || field === dropped.low
                      const cell = (
                        <td
                          key={field}
                          className={`${td} p-0.5`}
                          title={circled ? `${field === dropped.high ? 'Highest' : 'Lowest'} of judges 1–4 — not counted`
                            : field === 'head_judge_score' ? 'Head judge — not part of the average' : undefined}
                        >
                          <input
                            id={`cell-${index}-${field}`}
                            type={isTime ? 'text' : 'number'}
                            inputMode={isTime ? 'text' : 'decimal'}
                            step="0.01"
                            min="0"
                            max={field === 'deduction' ? undefined : max}
                            value={row[field] ?? ''}
                            placeholder={isTime ? 'mm:ss' : ''}
                            maxLength={isTime ? 10 : undefined}
                            onChange={(e) => updateRow(row.id, field, e.target.value)}
                            onKeyDown={(e) => onKeyDown(e, index, field)}
                            className={`${cellInput} ${bad ? 'text-red-600 font-semibold' : 'text-blue-900'} ${
                              circled ? '!rounded-full !border-2 border-solid !border-red-600' : ''
                            }`}
                            disabled={locked}
                            aria-label={`${row.player_name} ${field.replace(/_/g, ' ')}`}
                          />
                        </td>
                      )
                      if (field === 'deduction') {
                        return [
                          <td key="avg" className={`${td} px-1 text-blue-900 font-medium tabular-nums`}>{fmtScore(averageOf(row))}</td>,
                          cell
                        ]
                      }
                      return cell
                    })}
                    <td
                      className={`${td} px-1 font-semibold text-blue-900 tabular-nums ${
                        bestCount && finalOf(row) !== null && !counted.has(row.id) ? 'opacity-50 print:opacity-100' : ''
                      }`}
                      title={bestCount ? (counted.has(row.id) ? 'Counts towards the team score' : `Not in the team's best ${bestCount}`) : undefined}
                    >
                      {fmtScore(finalOf(row))}
                      {bestCount && counted.has(row.id) && <span className="text-green-700 print:hidden"> ✓</span>}
                    </td>
                  </tr>
                )
              })}
              {Array.from({ length: blankRows }, (_, i) => (
                <tr key={`blank-${i}`} className="h-11">
                  <td className={`${td} font-sans`}>{rows.length + i + 1}.</td>
                  {Array.from({ length: JUDGE_FIELDS.length + 5 }, (_, j) => <td key={j} className={td} />)}
                </tr>
              ))}
              {adding && (
                <tr className="print:hidden bg-primary-50">
                  <td className={`${td} font-sans text-gray-500`}>{rows.length + 1}.</td>
                  <td colSpan={JUDGE_FIELDS.length + 5} className={`${td} px-2 py-2`}>
                    <form
                      className="flex flex-wrap items-center gap-2 text-sm font-sans"
                      onSubmit={(e) => { e.preventDefault(); addMutation.mutate(adding) }}
                    >
                      <input
                        autoFocus
                        value={adding.name}
                        onChange={(e) => setAdding({ ...adding, name: e.target.value })}
                        onBlur={(e) => suggestMarathi(e.target.value)}
                        placeholder="Player name (English)"
                        maxLength={100}
                        className="input py-1.5 w-56"
                      />
                      <input
                        value={adding.name_marathi}
                        onChange={(e) => setAdding({ ...adding, name_marathi: e.target.value })}
                        placeholder="नाव (मराठी)"
                        lang="mr"
                        maxLength={100}
                        className="input py-1.5 w-56"
                      />
                      {isMixed && (
                        <select
                          value={adding.gender}
                          onChange={(e) => setAdding({ ...adding, gender: e.target.value })}
                          className="input py-1.5 w-28"
                          aria-label="Gender"
                        >
                          <option value="">Boy / Girl</option>
                          <option value="male">Boy</option>
                          <option value="female">Girl</option>
                        </select>
                      )}
                      <button
                        type="submit"
                        disabled={addMutation.isPending || (!adding.name.trim() && !adding.name_marathi.trim()) || (isMixed && !adding.gender)}
                        className="btn btn-primary py-1.5 inline-flex items-center gap-1"
                      >
                        <FiPlus /> {addMutation.isPending ? 'Adding…' : 'Add'}
                      </button>
                      <button type="button" onClick={() => setAdding(null)} className="btn btn-outline py-1.5 inline-flex items-center gap-1">
                        <FiX /> Cancel
                      </button>
                    </form>
                  </td>
                </tr>
              )}
              <tr>
                <td colSpan={JUDGE_FIELDS.length + 5} className="pr-2 text-right font-bold text-lg align-middle">
                  सांघिक गुण
                  {bestCount && <span className="block text-xs font-normal text-gray-500 print:hidden">best {bestCount} final scores (✓)</span>}
                </td>
                <td className={`${td} h-12 text-blue-900 font-bold text-lg tabular-nums`}>{fmtScore(teamPoints)}</td>
              </tr>
            </tbody>
          </table>

          {/* Signature lines, arranged as on the form */}
          <div className="mt-2 grid grid-cols-3 gap-x-10 font-bold text-lg">
            <Signatures form={form} onChange={updateForm} disabled={locked} items={[
              { key: 'judge_head', label: 'पंच प्रमुख' }, { key: 'judge1', label: 'पंच क्र.१' }, { key: 'judge2', label: 'पंच क्र.२' }
            ]} />
            <Signatures form={form} onChange={updateForm} disabled={locked} items={[
              { key: 'judge3', label: 'पंच क्र.३' }, { key: 'judge4', label: 'पंच क्र.४' }
            ]} />
            <Signatures form={form} onChange={updateForm} disabled={locked} items={[
              { key: 'scorer', label: 'गुणलेखक' }, { key: 'timekeeper', label: 'वेळाधिकारी' }, { key: 'director', label: 'स्पर्धा संचालक' }
            ]} />
          </div>
        </div>
      </div>

      <p className="text-xs text-gray-500 print:hidden">
        सरासरी = of judges 1–4 the highest and lowest (circled) are left out and the other two averaged; the head judge
        is not counted · अंतिम गुण = सरासरी − गुण कपात ·{' '}
        {bestCount ? `सांघिक गुण = sum of the best ${bestCount} finals (marked ✓)` : 'सांघिक गुण = sum of finals'} ·
        Every line of the form can be typed in; player names are saved to the player. Press Enter to move down a row.
        Print gives one A4 landscape page.
      </p>

      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <button
          onClick={save}
          disabled={saveMutation.isPending || locked || hasProblems || !dirty}
          className="btn btn-primary inline-flex items-center gap-2"
        >
          <FiSave /> Save now
        </button>
        {sheet.status === 'draft' ? (
          <button
            onClick={() => statusMutation.mutate('submitted')}
            disabled={statusMutation.isPending || dirty}
            className="btn btn-outline inline-flex items-center gap-2"
            title="Mark the sheet as final"
          >
            <FiCheckCircle /> Submit sheet
          </button>
        ) : isAdmin && (
          <button
            onClick={() => statusMutation.mutate('draft')}
            disabled={statusMutation.isPending}
            className="btn btn-outline inline-flex items-center gap-2"
          >
            <FiRotateCcw /> Reopen
          </button>
        )}
        <button
          onClick={() => setAdding({ name: '', name_marathi: '', gender: '' })}
          disabled={locked || !!adding}
          className="btn btn-outline inline-flex items-center gap-2"
          title="Add a player to this team in this age group"
        >
          <FiPlus /> Add player
        </button>
        <button onClick={() => window.print()} className="btn btn-outline inline-flex items-center gap-2">
          <FiPrinter /> Print
        </button>
        <span className={`text-sm ml-auto ${hasProblems ? 'text-red-600' : dirty ? 'text-amber-600' : 'text-gray-500'}`} aria-live="polite">
          {saveState}
        </span>
      </div>
    </div>
  )
}

export default ScoreSheetEditor
