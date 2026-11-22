import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import { FiCheckCircle, FiPrinter, FiRotateCcw, FiSave } from 'react-icons/fi'
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

const Circled = ({ on, colour, children }) => (
  <span className={on ? `rounded-full border-2 px-1.5 ${colour}` : 'px-1.5'}>{children}</span>
)

const Signatures = ({ labels }) => (
  <div className="space-y-1">
    {labels.map((label) => (
      <div key={label} className="flex items-end gap-3">
        <span className="whitespace-nowrap">{label}</span>
        <span className="flex-1 border-b border-black mb-1.5" />
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
  deduction: num(r.deduction) ?? 0
}))

const cellInput = 'w-full px-1 py-1.5 text-center border-0 bg-transparent rounded focus:ring-2 focus:ring-primary-400 disabled:bg-transparent tabular-nums print:p-0 print:placeholder-transparent'

/**
 * One गुणपत्रिका: a team's players for one age group + apparatus. Totals update as
 * you type and the sheet autosaves shortly after you stop, so the results page
 * follows along live.
 */
const ScoreSheetEditor = ({ sheetId, onSaved, isAdmin = true }) => {
  const queryClient = useQueryClient()
  const [rows, setRows] = useState([])
  const [dirty, setDirty] = useState(false)
  const [savedAt, setSavedAt] = useState(null)
  const version = useRef(0)

  const { data: sheet, isLoading } = useQuery({
    queryKey: ['score-sheet', sheetId],
    queryFn: async () => (await api.get(`/score-sheets/${sheetId}`)).data.data,
    refetchOnWindowFocus: false
  })

  // Load rows whenever a different sheet arrives
  useEffect(() => {
    if (sheet) {
      // An unscored row shows an empty गुण कपात, as on the paper form
      setRows(sheet.entries.map((e) => ({
        ...e,
        deduction: e.final_score === null && !Number(e.deduction) ? '' : e.deduction
      })))
      setDirty(false)
    }
  }, [sheet?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const max = sheet?.max_judge_score ?? 10
  const problems = useMemo(() => Object.fromEntries(rows.map((r) => [r.id, rowProblem(r, max)])), [rows, max])
  const hasProblems = Object.values(problems).some(Boolean)
  const locked = sheet?.status === 'submitted' && !isAdmin

  const saveMutation = useMutation({
    mutationFn: ({ payloadRows }) => api.put(`/score-sheets/${sheetId}`, { entries: toEntries(payloadRows) }),
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
      queryClient.setQueryData(['score-sheet', sheetId], (old) => old && { ...old, team_points: server.team_points })
      queryClient.invalidateQueries({ queryKey: ['scoring-board'] })
      queryClient.invalidateQueries({ queryKey: ['results'] })
      onSaved?.()
    },
    onError: (error) => toast.error(errorMessage(error, 'Failed to save scores'))
  })

  const save = () => {
    if (hasProblems || locked) return
    saveMutation.mutate({ payloadRows: rows, savedVersion: version.current })
  }

  // Autosave ~1s after the last keystroke
  useEffect(() => {
    if (!dirty || hasProblems || locked) return undefined
    const t = setTimeout(save, 1000)
    return () => clearTimeout(t)
  }, [rows, dirty, hasProblems, locked]) // eslint-disable-line react-hooks/exhaustive-deps

  // Leaving the sheet (switching team, navigating away) before the autosave fired:
  // flush the pending edits instead of dropping them.
  const pending = useRef(null)
  pending.current = dirty && !hasProblems && !locked ? rows : null
  useEffect(() => () => {
    const unsaved = pending.current
    if (!unsaved) return
    api.put(`/score-sheets/${sheetId}`, { entries: toEntries(unsaved) }).then(() => {
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
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)))
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


  if (isLoading || !sheet) return <div className="card text-center py-10 text-gray-500">Loading sheet…</div>

  const saveState = saveMutation.isPending ? 'Saving…'
    : hasProblems ? 'Fix the highlighted scores to save'
      : dirty ? 'Unsaved changes'
        : savedAt ? `Saved ${savedAt.toLocaleTimeString()}` : 'All changes saved'

  // The paper sheet always shows at least six rows
  const blankRows = Math.max(0, MIN_ROWS - rows.length)
  const circleColour = sheet.category === 'rope' ? 'border-red-700' : 'border-blue-800'
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
            <div className="flex items-end gap-2 flex-1">
              <span className="font-bold text-lg whitespace-nowrap">संघाचे नाव :</span>
              <span className="flex-1 border-b border-black text-blue-900 px-1">{sheet.team_name}</span>
            </div>
            <div className="flex items-end gap-2 w-[22rem]">
              <span className="font-bold text-lg whitespace-nowrap">वयोगट :</span>
              <span className="flex-1 border-b border-black text-blue-900 px-1">{ageGroupLabel(sheet)}</span>
            </div>
          </div>

          <div className="mt-2 flex items-center gap-8 font-bold text-lg">
            <span className="border-2 border-black px-2 font-sans leading-tight">{APPARATUS_LETTER[sheet.category] || '?'}</span>
            <span>
              <Circled on={sheet.age_group_gender === 'male'} colour="border-blue-800">मुले</Circled>
              {' / '}
              <Circled on={sheet.age_group_gender === 'female'} colour="border-blue-800">मुली</Circled>
            </span>
            <span>
              {APPARATUS_MR.map((a, i) => (
                <span key={a.value}>
                  {i > 0 && '/'}
                  <Circled on={sheet.category === a.value} colour={circleColour}>{a.label}</Circled>
                </span>
              ))}
            </span>
            <span className="ml-auto whitespace-pre">{'दि.      /      / २०'}</span>
          </div>
          <p className="text-center font-bold">स्पर्धा क्र. १ अ,ब/ २ / ३</p>

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
                    <td className={`${td} px-1 font-sans`}>{index + 1}.</td>
                    <td className={`${td} px-2 py-1 text-left`}>
                      <div className="text-blue-900 font-medium leading-snug" lang={row.name_marathi ? 'mr' : 'en'}>
                        {row.name_marathi || row.player_name}
                        {sheet.age_group_gender === 'mixed' && row.gender && (
                          <span className="ml-1 text-xs text-gray-500">({playerGenderLabel(row.gender)})</span>
                        )}
                      </div>
                      {row.name_marathi && (
                        <div className="text-xs text-gray-500 print:hidden" lang="en">{row.player_name}</div>
                      )}
                      {problems[row.id] && <div className="text-xs text-red-600 print:hidden">{problems[row.id]}</div>}
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
            <Signatures labels={['पंच प्रमुख', 'पंच क्र.१', 'पंच क्र.२']} />
            <Signatures labels={['पंच क्र.३', 'पंच क्र.४']} />
            <Signatures labels={['गुणलेखक', 'वेळाधिकारी', 'स्पर्धा संचालक']} />
          </div>
        </div>
      </div>

      <p className="text-xs text-gray-500 print:hidden">
        सरासरी = of judges 1–4 the highest and lowest (circled) are left out and the other two averaged; the head judge
        is not counted · अंतिम गुण = सरासरी − गुण कपात ·{' '}
        {bestCount ? `सांघिक गुण = sum of the best ${bestCount} finals (marked ✓)` : 'सांघिक गुण = sum of finals'} ·
        Press Enter to move down a row. Print gives one A4 landscape page.
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
