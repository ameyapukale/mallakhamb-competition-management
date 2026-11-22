// Shared helpers for the simplified competition flow. ageOn / findAgeGroup mirror
// server/src/utils/competitionSetup.js so the age group shown while typing is the
// one the server will assign; the server re-checks on save and its answer wins.

export const APPARATUS = [
  { value: 'pole', label: 'Pole', long: 'Pole Mallakhamb' },
  { value: 'rope', label: 'Rope', long: 'Rope Mallakhamb' },
  { value: 'hanging', label: 'Hanging', long: 'Hanging Mallakhamb' }
]

export const apparatusLabel = (value) => APPARATUS.find((a) => a.value === value)?.label || value

// One colour for every apparatus: different colours read as different states
const APPARATUS_TAG = 'bg-primary-50 text-primary-700 border border-primary-200'
export const APPARATUS_BADGE = { pole: APPARATUS_TAG, rope: APPARATUS_TAG, hanging: APPARATUS_TAG }

export const STATUSES = [
  { value: 'draft', label: 'Draft', hint: 'Hidden from the public', badge: 'bg-gray-100 text-gray-700' },
  { value: 'registration_open', label: 'Registration open', hint: 'Teams can register from the home page', badge: 'bg-green-100 text-green-700' },
  { value: 'registration_closed', label: 'Registration closed', hint: 'Visible, but no new teams', badge: 'bg-amber-100 text-amber-700' },
  { value: 'ongoing', label: 'In progress', hint: 'Scoring under way, live results', badge: 'bg-blue-100 text-blue-700' },
  { value: 'completed', label: 'Completed', hint: 'Final results', badge: 'bg-purple-100 text-purple-700' }
]

export const statusInfo = (value) =>
  STATUSES.find((s) => s.value === value) || { value, label: value, badge: 'bg-gray-100 text-gray-700' }

const parts = (value) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''))
  if (!m) return null
  const [y, mo, d] = m.slice(1).map(Number)
  const check = new Date(y, mo - 1, d)
  if (check.getFullYear() !== y || check.getMonth() !== mo - 1 || check.getDate() !== d) return null
  return { y, m: mo, d }
}

/** Completed years of age on a reference date (both 'YYYY-MM-DD'). */
export const ageOn = (dob, onDate) => {
  const b = parts(dob)
  const r = parts(onDate)
  if (!b || !r) return null
  let age = r.y - b.y
  if (r.m < b.m || (r.m === b.m && r.d < b.d)) age--
  return age
}

// Players are boys or girls; an age group is for boys, girls or both
export const PLAYER_GENDERS = [
  { value: 'male', label: 'Boy' },
  { value: 'female', label: 'Girl' }
]
export const GROUP_GENDERS = [
  { value: 'male', label: 'Boys' },
  { value: 'female', label: 'Girls' },
  { value: 'mixed', label: 'Mixed' }
]
export const groupGenderLabel = (value) => GROUP_GENDERS.find((g) => g.value === value)?.label || 'Mixed'
export const playerGenderLabel = (value) => PLAYER_GENDERS.find((g) => g.value === value)?.label || '–'
const GENDER_TAG = 'bg-gray-100 text-gray-700'
export const GENDER_BADGE = { male: GENDER_TAG, female: GENDER_TAG, mixed: GENDER_TAG }

/** The age group whose range fits the age and which is for this gender (or mixed). */
// An empty min or max age means "no limit on that side"
const isBlank = (v) => v === null || v === undefined || v === ''
export const lowAge = (g) => (isBlank(g.min_age) ? -Infinity : Number(g.min_age))
export const highAge = (g) => (isBlank(g.max_age) ? Infinity : Number(g.max_age))

/** "10–11 yrs", "up to 9 yrs", "18+ yrs", "any age" */
export const ageRangeLabel = (g) => {
  const min = isBlank(g.min_age) ? null : g.min_age
  const max = isBlank(g.max_age) ? null : g.max_age
  if (min !== null && max !== null) return `${min}–${max} yrs`
  if (max !== null) return `up to ${max} yrs`
  if (min !== null) return `${min}+ yrs`
  return 'any age'
}

/** 31 December of the year of a 'YYYY-MM-DD' date */
export const yearEnd = (ymd) => (/^\d{4}/.test(ymd || '') ? `${ymd.slice(0, 4)}-12-31` : '')

export const findAgeGroup = (groups, age, gender) =>
  age === null ? null : (groups || []).find((g) =>
    age >= lowAge(g) && age <= highAge(g) &&
    ((g.gender || 'mixed') === 'mixed' || g.gender === gender)) || null

/** The finals that count towards a team score: all, or the best N when set. */
export const countedFinals = (finals, bestCount) => {
  const sorted = finals.filter((f) => f !== null && f !== undefined).sort((a, b) => b - a)
  return bestCount ? sorted.slice(0, bestCount) : sorted
}

export const todayYMD = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** '2026-12-10' -> '10 Dec 2026' without timezone drift. */
export const formatDate = (value) => {
  const p = parts(value)
  if (!p) return ''
  return new Date(p.y, p.m - 1, p.d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

export const formatDateRange = (start, end) =>
  !end || start === end ? formatDate(start) : `${formatDate(start)} – ${formatDate(end)}`

/**
 * Scores are shown with 2 decimals, or 3 when the third decimal is not 0:
 * 8.05 -> "8.05", 8.050 -> "8.05", 8.033 -> "8.033", 8 -> "8.00".
 */
export const fmtScore = (v) => {
  if (v === null || v === undefined || v === '') return '–'
  const n = Number(v)
  if (!Number.isFinite(n)) return '–'
  const three = (Math.round(n * 1000) / 1000).toFixed(3)
  return three.endsWith('0') ? three.slice(0, -1) : three
}

export const errorMessage = (error, fallback) =>
  error?.response?.data?.errors?.[0]?.msg || error?.response?.data?.message || fallback
