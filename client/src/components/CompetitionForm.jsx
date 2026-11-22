import { useMemo, useState } from 'react'
import { FiPlus, FiTrash2, FiArrowUp, FiArrowDown, FiAlertCircle, FiCheck } from 'react-icons/fi'
import { APPARATUS, GROUP_GENDERS, highAge, lowAge, yearEnd } from '../utils/competition'

let nextKey = 1
const blankGroup = (min = '', max = '', gender = 'mixed') => ({
  key: `g-${nextKey++}`, id: null, group_name: '', min_age: min, max_age: max, gender, apparatus: ['pole']
})

// A common starting point the admin can then adjust: boys on pole + hanging,
// girls on pole + rope, from Under 10 to Open.
const BANDS = [
  ['Under 10', '', 9], ['Under 12', 10, 11], ['Under 14', 12, 13], ['Under 17', 14, 16], ['Open', 17, '']
]
const TEMPLATE = BANDS.flatMap(([name, min, max]) => [
  { group_name: `${name} Boys`, min_age: min, max_age: max, gender: 'male', apparatus: ['pole', 'hanging'] },
  { group_name: `${name} Girls`, min_age: min, max_age: max, gender: 'female', apparatus: ['pole', 'rope'] }
])

const FIELDS = [
  'competition_name', 'description', 'start_date', 'end_date', 'age_reference_date',
  'venue', 'city', 'state', 'max_teams', 'max_players_per_team', 'team_best_count',
  'organizer_name', 'organizer_contact'
]

const gendersMeet = (a, b) => a === 'mixed' || b === 'mixed' || a === b

/** Problems with the age group list, keyed by row key ('' = whole list). */
const checkGroups = (groups) => {
  const problems = {}
  const names = new Map()
  groups.forEach((g) => {
    const name = g.group_name.trim()
    // Min and max are optional: empty means "no limit on that side"
    const badAge = (v) => v !== '' && !(Number.isInteger(Number(v)) && Number(v) >= 0 && Number(v) <= 120)
    if (!name) problems[g.key] = 'Name required'
    else if (names.has(name.toLowerCase())) problems[g.key] = 'Duplicate name'
    else if (badAge(g.min_age) || badAge(g.max_age)) problems[g.key] = 'Ages must be whole numbers from 0 to 120'
    else if (lowAge(g) > highAge(g)) problems[g.key] = 'Min age is above max age'
    else if (g.apparatus.length === 0) problems[g.key] = 'Pick at least one apparatus'
    names.set(name.toLowerCase(), true)
  })
  // Boys and Girls groups may share ages; a Mixed group clashes with both
  const valid = groups.filter((g) => !problems[g.key])
  valid.forEach((b, j) => {
    const clash = valid.slice(0, j).find((a) =>
      lowAge(a) <= highAge(b) && lowAge(b) <= highAge(a) &&
      gendersMeet(a.gender || 'mixed', b.gender || 'mixed'))
    if (clash) problems[b.key] = `Overlaps with "${clash.group_name.trim()}"`
  })
  if (groups.length === 0) problems[''] = 'Add at least one age group'
  return problems
}

const CompetitionForm = ({ initial, onSubmit, onCancel, submitting, submitLabel, scoringStarted }) => {
  const [values, setValues] = useState(() => {
    const v = Object.fromEntries(FIELDS.map((f) => [f, initial?.[f] ?? '']))
    // No date chosen yet: show the default, 31 Dec of the competition year
    if (!v.age_reference_date) v.age_reference_date = yearEnd(v.start_date)
    return v
  })
  const [groups, setGroups] = useState(() =>
    initial?.age_groups?.length
      ? initial.age_groups.map((g) => ({
        ...g, min_age: g.min_age ?? '', max_age: g.max_age ?? '', gender: g.gender || 'mixed', key: `g-${g.id}`
      }))
      : [blankGroup()]
  )
  const [showErrors, setShowErrors] = useState(false)

  const groupProblems = useMemo(() => checkGroups(groups), [groups])
  const fieldProblems = {
    competition_name: !values.competition_name.trim() && 'Competition name is required',
    start_date: !values.start_date && 'Start date is required',
    end_date: (!values.end_date && 'End date is required') ||
      (values.start_date && values.end_date < values.start_date && 'End date is before the start date')
  }
  const best = values.team_best_count
  if (best !== '' && best !== null && !(Number.isInteger(Number(best)) && Number(best) >= 1)) {
    fieldProblems.team_best_count = 'Enter a whole number of players, or leave empty'
  }
  const hasErrors = Object.values(fieldProblems).some(Boolean) || Object.keys(groupProblems).length > 0

  const set = (field) => (e) => setValues((v) => ({ ...v, [field]: e.target.value }))

  // Changing the start date moves "age counted as on" to 31 Dec of that year,
  // unless the admin has picked some other date
  const setStartDate = (e) => {
    const start = e.target.value
    setValues((v) => {
      const followsStart = !v.age_reference_date || v.age_reference_date === yearEnd(v.start_date)
      return { ...v, start_date: start, ...(followsStart ? { age_reference_date: yearEnd(start) } : {}) }
    })
  }

  const updateGroup = (key, field, value) =>
    setGroups((prev) => prev.map((g) => (g.key === key ? { ...g, [field]: value } : g)))

  const toggleApparatus = (key, value) =>
    setGroups((prev) => prev.map((g) => g.key !== key ? g : {
      ...g,
      apparatus: g.apparatus.includes(value)
        ? g.apparatus.filter((a) => a !== value)
        : APPARATUS.map((a) => a.value).filter((a) => a === value || g.apparatus.includes(a))
    }))

  const move = (index, delta) => setGroups((prev) => {
    const next = [...prev]
    const [item] = next.splice(index, 1)
    next.splice(index + delta, 0, item)
    return next
  })

  // A new group continues where the last group of the same gender left off
  const addGroup = () => setGroups((prev) => {
    const last = prev[prev.length - 1]
    const gender = last?.gender || 'mixed'
    const top = prev.filter((g) => g.gender === gender)
      .reduce((m, g) => Math.max(m, Number(g.max_age) || -1), -1)
    return [...prev, blankGroup(top >= 0 ? top + 1 : '', '', gender)]
  })

  const useTemplate = () => setGroups(TEMPLATE.map((g) => ({ ...g, key: `g-${nextKey++}`, id: null })))

  const submit = (e) => {
    e.preventDefault()
    setShowErrors(true)
    if (hasErrors) return
    onSubmit({
      ...values,
      age_groups: groups.map((g) => ({
        ...(g.id ? { id: g.id } : {}),
        group_name: g.group_name.trim(),
        min_age: g.min_age === '' ? null : Number(g.min_age),
        max_age: g.max_age === '' ? null : Number(g.max_age),
        gender: g.gender || 'mixed',
        apparatus: g.apparatus
      }))
    })
  }

  const err = (field) => showErrors && fieldProblems[field] && (
    <p className="text-red-500 text-sm mt-1">{fieldProblems[field]}</p>
  )

  const onlyBlank = groups.length === 1 && !groups[0].group_name && groups[0].min_age === '' && groups[0].max_age === ''

  return (
    <form onSubmit={submit} className="space-y-8" noValidate>
      <section className="space-y-4">
        <div>
          <label className="label" htmlFor="competition_name">Competition name *</label>
          <input id="competition_name" value={values.competition_name} onChange={set('competition_name')}
            className="input" placeholder="e.g. State Mallakhamb Championship 2026" maxLength={150} />
          {err('competition_name')}
        </div>

        <div>
          <label className="label" htmlFor="description">Description</label>
          <textarea id="description" value={values.description} onChange={set('description')}
            className="input" rows={3} placeholder="Shown on the home page" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="label" htmlFor="start_date">Start date *</label>
            <input id="start_date" type="date" value={values.start_date} onChange={setStartDate} className="input" />
            {err('start_date')}
          </div>
          <div>
            <label className="label" htmlFor="end_date">End date *</label>
            <input id="end_date" type="date" value={values.end_date} onChange={set('end_date')} className="input" />
            {err('end_date')}
          </div>
          <div>
            <label className="label" htmlFor="age_reference_date">Age counted as on</label>
            <input id="age_reference_date" type="date" value={values.age_reference_date} onChange={set('age_reference_date')} className="input" />
            <p className="text-xs text-gray-500 mt-1">
              Set to 31 December of the competition year; change it if needed
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="label" htmlFor="venue">Venue</label>
            <input id="venue" value={values.venue} onChange={set('venue')} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="city">City</label>
            <input id="city" value={values.city} onChange={set('city')} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="state">State</label>
            <input id="state" value={values.state} onChange={set('state')} className="input" />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="label" htmlFor="max_teams">Max teams</label>
            <input id="max_teams" type="number" min="1" value={values.max_teams ?? ''} onChange={set('max_teams')} className="input" placeholder="No limit" />
          </div>
          <div>
            <label className="label" htmlFor="max_players_per_team">Max players / team</label>
            <input id="max_players_per_team" type="number" min="1" value={values.max_players_per_team ?? ''} onChange={set('max_players_per_team')} className="input" placeholder="No limit" />
          </div>
          <div>
            <label className="label" htmlFor="organizer_name">Organiser</label>
            <input id="organizer_name" value={values.organizer_name} onChange={set('organizer_name')} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="organizer_contact">Organiser contact</label>
            <input id="organizer_contact" value={values.organizer_contact} onChange={set('organizer_contact')} className="input" placeholder="Phone / email" />
          </div>
        </div>
      </section>

      <section className="border-t pt-6">
        <h2 className="text-lg font-semibold">Scoring settings</h2>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-[14rem_1fr] gap-4 items-start">
          <div>
            <label className="label" htmlFor="team_best_count">Team score counts best</label>
            <div className="flex items-center gap-2">
              <input
                id="team_best_count" type="number" min="1" step="1"
                value={values.team_best_count ?? ''}
                onChange={set('team_best_count')}
                className="input w-24" placeholder="All"
              />
              <span className="text-sm text-gray-600">players</span>
            </div>
            {err('team_best_count')}
          </div>
          <p className="text-sm text-gray-500 sm:pt-7">
            {values.team_best_count
              ? `On each score sheet (age group × apparatus) only the team's top ${values.team_best_count} final scores add up to the team score. Every player is still ranked individually.`
              : 'Leave empty to add up every player\'s final score. Enter a number (e.g. 5) to count only each team\'s top scores on every apparatus.'}
          </p>
        </div>
      </section>

      <section className="border-t pt-6">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="text-lg font-semibold">Age groups &amp; apparatus</h2>
            <p className="text-sm text-gray-500">
              Players are placed by gender and age (inclusive range). Each age group gets one score
              sheet per apparatus per team and its own rankings. Boys and Girls groups may cover the
              same ages; otherwise age groups must not overlap. Leave min or max age empty for no limit
              (e.g. Under 10, or 18 and above).
            </p>
          </div>
          {onlyBlank && (
            <button type="button" onClick={useTemplate} className="text-sm text-primary-600 hover:underline">
              Start from common boys &amp; girls age groups
            </button>
          )}
        </div>

        {scoringStarted && (
          <p className="text-sm text-amber-700 bg-amber-50 rounded-lg p-3 mb-4">
            Scoring has started. You can still rename groups or add apparatus, but an age group or
            apparatus that already has scores cannot be removed, and players with scores cannot be
            moved to a different age group.
          </p>
        )}

        <div className="space-y-3">
          <div className="hidden md:grid grid-cols-[2rem_1fr_6rem_4.5rem_4.5rem_17rem_4.5rem] gap-3 px-1 text-xs font-semibold text-gray-500 uppercase">
            <span />
            <span>Name</span>
            <span>For</span>
            <span>Min age</span>
            <span>Max age</span>
            <span>Apparatus</span>
            <span />
          </div>
          {groups.map((g, index) => (
            <div key={g.key} className="border rounded-lg p-3 md:border-0 md:p-0">
              <div className="grid grid-cols-2 md:grid-cols-[2rem_1fr_6rem_4.5rem_4.5rem_17rem_4.5rem] gap-3 items-center">
                <span className="hidden md:block text-sm text-gray-400 text-right">{index + 1}.</span>
                <input
                  value={g.group_name}
                  onChange={(e) => updateGroup(g.key, 'group_name', e.target.value)}
                  className="input col-span-2 md:col-span-1"
                  placeholder="e.g. Under 12"
                  maxLength={50}
                  aria-label={`Age group ${index + 1} name`}
                />
                <select
                  value={g.gender}
                  onChange={(e) => updateGroup(g.key, 'gender', e.target.value)}
                  className="input col-span-2 md:col-span-1"
                  aria-label={`Age group ${index + 1} is for`}
                >
                  {GROUP_GENDERS.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
                </select>
                <input
                  type="number" min="0" max="120"
                  value={g.min_age}
                  onChange={(e) => updateGroup(g.key, 'min_age', e.target.value)}
                  className="input" placeholder="Any"
                  aria-label={`Age group ${index + 1} minimum age`}
                />
                <input
                  type="number" min="0" max="120"
                  value={g.max_age}
                  onChange={(e) => updateGroup(g.key, 'max_age', e.target.value)}
                  className="input" placeholder="Any"
                  aria-label={`Age group ${index + 1} maximum age`}
                />
                <div className="flex flex-wrap gap-2 col-span-2 md:col-span-1">
                  {APPARATUS.map((a) => {
                    const on = g.apparatus.includes(a.value)
                    return (
                      <button
                        key={a.value}
                        type="button"
                        onClick={() => toggleApparatus(g.key, a.value)}
                        aria-pressed={on}
                        className={`text-sm rounded-full px-3 py-1 border transition-colors inline-flex items-center gap-1 ${
                          on ? 'bg-primary-600 border-primary-600 text-white font-medium' : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
                        }`}
                      >
                        {on && <FiCheck className="w-3.5 h-3.5" />}
                        {a.label}
                      </button>
                    )
                  })}
                </div>
                <div className="flex justify-end gap-1 col-span-2 md:col-span-1">
                  <button type="button" onClick={() => move(index, -1)} disabled={index === 0}
                    className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30" aria-label="Move up">
                    <FiArrowUp />
                  </button>
                  <button type="button" onClick={() => move(index, 1)} disabled={index === groups.length - 1}
                    className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30" aria-label="Move down">
                    <FiArrowDown />
                  </button>
                  <button type="button" onClick={() => setGroups((prev) => prev.filter((x) => x.key !== g.key))}
                    disabled={groups.length === 1}
                    className="p-1 text-gray-400 hover:text-red-600 disabled:opacity-30" aria-label="Remove age group">
                    <FiTrash2 />
                  </button>
                </div>
              </div>
              {showErrors && groupProblems[g.key] && (
                <p className="text-red-500 text-sm mt-1 md:ml-11 inline-flex items-center gap-1">
                  <FiAlertCircle className="w-4 h-4" /> {groupProblems[g.key]}
                </p>
              )}
            </div>
          ))}
        </div>

        <button type="button" onClick={addGroup} className="btn btn-outline mt-4 inline-flex items-center gap-2">
          <FiPlus /> Add age group
        </button>
      </section>

      <div className="flex justify-end gap-3 pt-4 border-t">
        {onCancel && <button type="button" onClick={onCancel} className="btn btn-outline">Cancel</button>}
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Saving…' : submitLabel}
        </button>
      </div>
      {showErrors && hasErrors && (
        <p className="text-sm text-red-600 text-right -mt-6">Please fix the highlighted fields.</p>
      )}
    </form>
  )
}

export default CompetitionForm
