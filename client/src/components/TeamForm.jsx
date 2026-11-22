import { useEffect, useMemo, useRef, useState } from 'react'
import { FiPlus, FiTrash2, FiAlertCircle } from 'react-icons/fi'
import {
  APPARATUS_BADGE, PLAYER_GENDERS, apparatusLabel, ageOn, findAgeGroup,
  formatDate, todayYMD
} from '../utils/competition'
import api from '../services/api'

let nextKey = 1
const blankPlayer = () => ({
  key: `new-${nextKey++}`, id: null, name: '', name_marathi: '', gender: '', date_of_birth: ''
})

/**
 * Marathi spelling of the player's name. Filled in automatically shortly after
 * the English name is typed; other spellings are offered as suggestions, and
 * the box can be edited by hand. Once edited by hand it is no longer overwritten.
 */
const MarathiNameInput = ({ id, english, value, onChange }) => {
  const [suggestions, setSuggestions] = useState([])
  const [busy, setBusy] = useState(false)
  // Hand-typed Marathi is never overwritten; a name loaded for editing counts as hand-typed
  const manual = useRef(Boolean(value))
  const lastEnglish = useRef(english)

  useEffect(() => {
    if (english === lastEnglish.current) return undefined
    lastEnglish.current = english
    const text = english.trim()
    if (!text) {
      setSuggestions([])
      if (!manual.current) onChange('')
      return undefined
    }
    let cancelled = false
    const timer = setTimeout(async () => {
      setBusy(true)
      try {
        const { data } = await api.post('/public/transliterate', { text })
        if (cancelled) return
        setSuggestions(data.data.suggestions || [])
        if (!manual.current) onChange(data.data.text)
      } catch {
        // Leave the box as it is; it can still be typed in
      } finally {
        if (!cancelled) setBusy(false)
      }
    }, 450)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [english]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <label className="text-xs text-gray-500 flex justify-between" htmlFor={id}>
        <span>नाव (मराठी)</span>
        {busy && <span className="text-gray-400">…</span>}
      </label>
      <input
        id={id}
        list={`${id}-list`}
        value={value || ''}
        onChange={(e) => {
          // Clearing the box hands it back to the automatic conversion
          manual.current = e.target.value.trim() !== ''
          onChange(e.target.value)
        }}
        className="input"
        placeholder="मराठीत नाव"
        maxLength={150}
        lang="mr"
      />
      <datalist id={`${id}-list`}>
        {suggestions.map((s) => <option key={s} value={s} />)}
      </datalist>
    </div>
  )
}

/**
 * Team name + list of players (name, boy/girl, date of birth). Each player's age
 * and age group are shown live from the DOB and gender. Used for public registration and admin edits.
 */
const TeamForm = ({
  ageGroups,
  referenceDate,
  maxPlayers,
  initial,
  onSubmit,
  onCancel,
  submitting,
  submitLabel = 'Register team',
  // Admin only: a player without a date of birth can be put in an age group directly
  allowManualGroup = false
}) => {
  const [teamName, setTeamName] = useState(initial?.team_name || '')
  const [players, setPlayers] = useState(() =>
    initial?.players?.length
      ? initial.players.map((p) => ({
        ...p, gender: p.gender || '', date_of_birth: p.date_of_birth || '',
        age_group_id: p.age_group_id || '', key: `p-${p.id}`
      }))
      : [blankPlayer()]
  )
  const [showErrors, setShowErrors] = useState(false)
  const lastNameInput = useRef(null)
  const focusNew = useRef(false)

  useEffect(() => {
    if (focusNew.current) {
      lastNameInput.current?.focus()
      focusNew.current = false
    }
  }, [players.length])

  const rows = useMemo(() => players.map((p) => {
    const age = p.date_of_birth ? ageOn(p.date_of_birth, referenceDate) : null
    const manual = allowManualGroup && !p.date_of_birth
    const group = !p.gender ? null
      : manual ? ageGroups.find((g) => g.id === Number(p.age_group_id) &&
          ((g.gender || 'mixed') === 'mixed' || g.gender === p.gender)) || null
        : findAgeGroup(ageGroups, age, p.gender)
    let error = null
    if (!p.name.trim()) error = 'Enter the player\'s name'
    else if (!p.gender) error = 'Choose Boy or Girl'
    else if (manual) { if (!group) error = 'Enter the date of birth or choose an age group' }
    else if (!p.date_of_birth) error = 'Enter the date of birth'
    else if (age === null) error = 'Enter a valid date of birth'
    else if (p.date_of_birth > todayYMD()) error = 'Date of birth is in the future'
    else if (!group) error = `Age ${age} fits no age group for ${p.gender === 'male' ? 'boys' : 'girls'}`
    return { ...p, age, group, error }
  }), [players, ageGroups, referenceDate, allowManualGroup])

  const teamError = !teamName.trim() ? 'Enter the team name' : null
  const hasErrors = !!teamError || rows.some((r) => r.error) || rows.length === 0
  const atLimit = maxPlayers && players.length >= maxPlayers

  const update = (key, field, value) =>
    setPlayers((prev) => prev.map((p) => (p.key === key ? { ...p, [field]: value } : p)))

  const addPlayer = () => {
    focusNew.current = true
    setPlayers((prev) => [...prev, blankPlayer()])
  }

  const removePlayer = (key) => setPlayers((prev) => prev.filter((p) => p.key !== key))

  const submit = (e) => {
    e.preventDefault()
    setShowErrors(true)
    if (hasErrors) return
    onSubmit({
      team_name: teamName.trim(),
      players: players.map((p) => ({
        ...(p.id ? { id: p.id } : {}),
        name: p.name.trim(),
        name_marathi: (p.name_marathi || '').trim(),
        gender: p.gender,
        date_of_birth: p.date_of_birth || null,
        ...(!p.date_of_birth && allowManualGroup ? { age_group_id: Number(p.age_group_id) || null } : {})
      }))
    })
  }

  // Count per age group, as a quick summary under the list
  const summary = ageGroups
    .map((g) => ({ ...g, count: rows.filter((r) => r.group?.id === g.id).length }))
    .filter((g) => g.count > 0)

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      <div>
        <label className="label" htmlFor="team_name">Team name *</label>
        <input
          id="team_name"
          value={teamName}
          onChange={(e) => setTeamName(e.target.value)}
          className="input"
          placeholder="e.g. Samarth Vyayam Mandir"
          maxLength={100}
          autoFocus={!initial}
        />
        {showErrors && teamError && <p className="text-red-500 text-sm mt-1">{teamError}</p>}
      </div>

      <div>
        <div className="flex items-baseline justify-between mb-2">
          <h2 className="font-semibold">Players ({players.length}{maxPlayers ? ` / ${maxPlayers}` : ''})</h2>
          <span className="text-xs text-gray-500">Age as on {formatDate(referenceDate)}</span>
        </div>

        <div className="space-y-3">
          {rows.map((row, index) => (
            <div key={row.key} className="border rounded-lg p-3 bg-gray-50/50">
              <div className="flex gap-3 items-start">
                <span className="w-6 pt-2 text-sm text-gray-400 text-right shrink-0">{index + 1}.</span>
                <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500" htmlFor={`name-${row.key}`}>Name (English)</label>
                    <input
                      id={`name-${row.key}`}
                      ref={index === rows.length - 1 ? lastNameInput : null}
                      value={row.name}
                      onChange={(e) => update(row.key, 'name', e.target.value)}
                      className="input"
                      placeholder="Player's full name"
                      maxLength={100}
                    />
                  </div>
                  <MarathiNameInput
                    id={`marathi-${row.key}`}
                    english={row.name}
                    value={row.name_marathi}
                    onChange={(value) => update(row.key, 'name_marathi', value)}
                  />
                  <div className="flex rounded-lg border border-gray-300 overflow-hidden self-start" role="radiogroup" aria-label={`Player ${index + 1} gender`}>
                    {PLAYER_GENDERS.map((g) => {
                      const on = row.gender === g.value
                      return (
                        <button
                          key={g.value}
                          type="button"
                          role="radio"
                          aria-checked={on}
                          onClick={() => update(row.key, 'gender', g.value)}
                          className={`flex-1 px-4 py-2 text-sm transition-colors ${
                            on ? 'bg-primary-600 text-white font-medium' : 'bg-white text-gray-600 hover:bg-gray-50'
                          }`}
                        >
                          {g.label}
                        </button>
                      )
                    })}
                  </div>
                  <div>
                    <label className="sr-only" htmlFor={`dob-${row.key}`}>Date of birth</label>
                    <input
                      id={`dob-${row.key}`}
                      type="date"
                      value={row.date_of_birth}
                      max={todayYMD()}
                      onChange={(e) => update(row.key, 'date_of_birth', e.target.value)}
                      className="input"
                      title="Date of birth"
                    />
                    {allowManualGroup && !row.date_of_birth && (
                      <select
                        value={row.age_group_id || ''}
                        onChange={(e) => update(row.key, 'age_group_id', e.target.value)}
                        className="input mt-2"
                        aria-label={`Player ${index + 1} age group`}
                      >
                        <option value="">No date of birth — choose age group</option>
                        {ageGroups
                          .filter((g) => !row.gender || (g.gender || 'mixed') === 'mixed' || g.gender === row.gender)
                          .map((g) => <option key={g.id} value={g.id}>{g.group_name}</option>)}
                      </select>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => removePlayer(row.key)}
                  disabled={players.length === 1 || row.has_scores}
                  className="p-2 mt-0.5 text-gray-400 hover:text-red-600 disabled:opacity-30 disabled:hover:text-gray-400"
                  title={row.has_scores ? 'This player already has scores' : 'Remove player'}
                  aria-label={`Remove player ${index + 1}`}
                >
                  <FiTrash2 className="w-5 h-5" />
                </button>
              </div>

              <div className="ml-9 mt-2 min-h-[1.5rem] flex flex-wrap items-center gap-2 text-sm">
                {row.group ? (
                  <>
                    <span className="text-gray-600">{row.age === null ? 'Age group →' : `Age ${row.age} →`}</span>
                    <span className="font-medium text-primary-700">{row.group.group_name}</span>
                    {row.group.apparatus.map((a) => (
                      <span key={a} className={`text-xs rounded-full px-2 py-0.5 ${APPARATUS_BADGE[a]}`}>
                        {apparatusLabel(a)}
                      </span>
                    ))}
                  </>
                ) : row.error && (showErrors || (row.date_of_birth && row.gender)) ? (
                  <span className="text-red-600 inline-flex items-center gap-1">
                    <FiAlertCircle className="w-4 h-4" /> {row.error}
                  </span>
                ) : (
                  <span className="text-gray-400">Age group is decided from gender and date of birth</span>
                )}
                {row.group && showErrors && row.error && (
                  <span className="text-red-600">{row.error}</span>
                )}
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={addPlayer}
          disabled={atLimit}
          className="btn btn-outline w-full mt-3 flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <FiPlus className="w-5 h-5" /> Add player
        </button>
        {atLimit && <p className="text-xs text-gray-500 mt-1 text-center">Maximum {maxPlayers} players per team</p>}

        {summary.length > 0 && (
          <p className="text-sm text-gray-600 mt-3">
            {summary.map((g) => `${g.group_name}: ${g.count}`).join(' · ')}
          </p>
        )}
      </div>

      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-2 border-t">
        {onCancel && (
          <button type="button" onClick={onCancel} className="btn btn-outline">Cancel</button>
        )}
        <button type="submit" disabled={submitting} className="btn btn-primary">
          {submitting ? 'Saving…' : submitLabel}
        </button>
      </div>
      {showErrors && hasErrors && (
        <p className="text-sm text-red-600 text-right -mt-3">Please fix the highlighted fields.</p>
      )}
    </form>
  )
}

export default TeamForm
