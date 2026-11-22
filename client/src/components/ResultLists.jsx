import { useMemo, useState } from 'react'
import { APPARATUS, ageRangeLabel, fmtScore, playerGenderLabel } from '../utils/competition'

// Prize lists built from the results API: every player's apparatus scores and total,
// ranked within whatever set a list needs (an age group, boys only, everyone, …).
// Ranking is "1, 2, 2, 4" like the server: equal totals share a rank, and a
// "top 3" includes everyone tied on rank 3. Unscored players never appear in a top list.

const MEDAL = { 1: '🥇', 2: '🥈', 3: '🥉' }
const round3 = (v) => Math.round(v * 1000) / 1000
const shortApparatus = (label) => label.replace(' Mallakhamb', '')

/** Rank by total (desc), shared ranks for equal totals; unscored players get rank null. */
export const rankPlayers = (players) => {
  const scored = players.filter((p) => p.total !== null).sort((a, b) => b.total - a.total)
  let previous = null
  const ranked = scored.map((p, index) => {
    const rank = previous && round3(previous.total) === round3(p.total) ? previous.rank : index + 1
    previous = { ...p, rank }
    return previous
  })
  const unscored = players.filter((p) => p.total === null)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((p) => ({ ...p, rank: null }))
  return [...ranked, ...unscored]
}

const topN = (players, n) => rankPlayers(players).filter((p) => p.rank !== null && p.rank <= n)

/** Every player of every age group, flattened, plus the apparatus columns in use. */
export const flattenResults = (groups) => {
  const used = new Set(groups.flatMap((g) => g.apparatus.map((a) => a.value)))
  const apparatus = APPARATUS.filter((a) => used.has(a.value))
  const players = groups.flatMap((g, order) => g.individuals.map((p) => ({
    ...p,
    group_rank: p.rank,
    age_group_id: g.age_group_id,
    group_name: g.group_name,
    group_order: order
  })))
  return { apparatus, players }
}

const RankBadge = ({ rank }) =>
  rank === null || rank === undefined ? <span className="text-gray-300">–</span>
    : <span className="font-semibold">{MEDAL[rank] || rank}</span>

const tone = (rank) =>
  rank === 1 ? 'bg-yellow-50' : rank === 2 ? 'bg-gray-50' : rank === 3 ? 'bg-orange-50/60' : ''

const Name = ({ p }) => (
  <>
    {p.name_marathi ? <span lang="mr">{p.name_marathi}</span> : p.name}
    {p.name_marathi && <span className="block text-xs font-normal text-gray-500">{p.name}</span>}
  </>
)

const Empty = ({ children }) => <p className="text-center text-gray-500 py-6 text-sm">{children}</p>

/** A ranked player table; columns adapt to what the list needs. */
const PlayerTable = ({ players, apparatus, showGroup = false, showGender = false, rankKey = 'rank', serial = false }) => (
  <div className="overflow-x-auto border rounded-lg print:overflow-visible">
    <table className="w-full text-sm">
      <thead>
        <tr className="table-header">
          {serial && <th className="px-2 py-2 text-center">Sr.</th>}
          <th className="px-2 py-2 text-center">Rank</th>
          <th className="px-3 py-2">Player</th>
          <th className="px-3 py-2">Team</th>
          {showGroup && <th className="px-3 py-2">Age group</th>}
          {showGender && <th className="px-3 py-2">Gender</th>}
          {apparatus.map((a) => <th key={a.value} className="px-3 py-2 text-right">{shortApparatus(a.label)}</th>)}
          <th className="px-3 py-2 text-right">Total</th>
        </tr>
      </thead>
      <tbody className="divide-y">
        {players.map((p, i) => (
          <tr key={`${p.age_group_id}-${p.player_id}`} className={`${tone(p[rankKey])} break-inside-avoid`}>
            {serial && <td className="px-2 py-2 text-center text-gray-500">{i + 1}</td>}
            <td className="px-2 py-2 text-center w-14 whitespace-nowrap"><RankBadge rank={p[rankKey]} /></td>
            <td className="px-3 py-2 font-medium"><Name p={p} /></td>
            <td className="px-3 py-2 text-gray-600">{p.team_name}</td>
            {showGroup && <td className="px-3 py-2 whitespace-nowrap">{p.group_name}</td>}
            {showGender && <td className="px-3 py-2">{playerGenderLabel(p.gender)}</td>}
            {apparatus.map((a) => (
              <td key={a.value} className="px-3 py-2 text-right tabular-nums">
                {a.value in p.scores ? fmtScore(p.scores[a.value]) : ''}
              </td>
            ))}
            <td className="px-3 py-2 text-right font-semibold tabular-nums">{fmtScore(p.total)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
)

/* ---------- 1. Overall result: everyone, with pole / rope marks and total ---------- */

export const OverallResult = ({ groups }) => {
  const { apparatus, players } = useMemo(() => flattenResults(groups), [groups])
  const [groupFilter, setGroupFilter] = useState('')
  const [gender, setGender] = useState('')
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('group')

  const list = useMemo(() => {
    const q = search.trim().toLowerCase()
    const filtered = players.filter((p) =>
      (!groupFilter || String(p.age_group_id) === groupFilter) &&
      (!gender || p.gender === gender) &&
      (!q || p.name.toLowerCase().includes(q) || (p.name_marathi || '').includes(q) || p.team_name.toLowerCase().includes(q)))
    if (sortBy === 'total') return rankPlayers(filtered)
    if (sortBy === 'team') {
      return [...filtered].sort((a, b) => a.team_name.localeCompare(b.team_name) ||
        a.group_order - b.group_order || a.name.localeCompare(b.name))
    }
    // By age group, then the rank inside it (the API already lists each group in rank order)
    return [...filtered].sort((a, b) => a.group_order - b.group_order)
  }, [players, groupFilter, gender, search, sortBy])

  const select = 'border rounded-lg px-3 py-1.5 text-sm bg-white'
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)} className={select} aria-label="Age group">
          <option value="">All age groups</option>
          {groups.map((g) => <option key={g.age_group_id} value={g.age_group_id}>{g.group_name}</option>)}
        </select>
        <select value={gender} onChange={(e) => setGender(e.target.value)} className={select} aria-label="Gender">
          <option value="">Boys and girls</option>
          <option value="male">Boys</option>
          <option value="female">Girls</option>
        </select>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className={select} aria-label="Sort">
          <option value="group">Sort: age group, then rank</option>
          <option value="total">Sort: highest total first</option>
          <option value="team">Sort: team</option>
        </select>
        <input
          type="search" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search player or team" className={`${select} min-w-[14rem]`}
        />
        <span className="text-sm text-gray-500 ml-auto">{list.length} players</span>
      </div>
      {list.length === 0 ? <Empty>No players match.</Empty> : (
        <PlayerTable
          players={list} apparatus={apparatus} showGroup showGender serial
          rankKey={sortBy === 'total' ? 'rank' : 'group_rank'}
        />
      )}
      <p className="text-xs text-gray-500">
        {sortBy === 'total'
          ? 'Rank = position in this list by total.'
          : 'Rank = position within the player\'s own age group.'}
      </p>
    </div>
  )
}

/* ---------- 2. Top 4 of each age group, boys and girls separately ---------- */

/** Each age group; a mixed group is split into its boys and its girls. */
const genderedGroups = (groups) => groups.flatMap((g) => {
  if (g.gender !== 'mixed') return [{ key: `${g.age_group_id}`, title: g.group_name, group: g, players: g.individuals }]
  return ['male', 'female'].map((gen) => ({
    key: `${g.age_group_id}-${gen}`,
    title: `${g.group_name} – ${gen === 'male' ? 'Boys' : 'Girls'}`,
    group: g,
    players: g.individuals.filter((p) => p.gender === gen)
  })).filter((s) => s.players.length)
})

export const TopFourPerGroup = ({ groups }) => {
  const sets = useMemo(() => genderedGroups(groups), [groups])
  return (
    <div className="grid gap-6 xl:grid-cols-2 print:grid-cols-1">
      {sets.map((s) => {
        const top = topN(s.players, 4)
        return (
          <div key={s.key} className="break-inside-avoid">
            <h3 className="font-semibold mb-2">{s.title}</h3>
            {top.length === 0 ? <Empty>No scores yet.</Empty>
              : <PlayerTable players={top} apparatus={s.group.apparatus} />}
          </div>
        )
      })}
    </div>
  )
}

/* ---------- 3. Top 3 per age group, boys and girls side by side ---------- */

/** Age bands: groups with the same age limits (e.g. U10 Boys + U10 Girls) form one band. */
const ageBands = (groups) => {
  const bands = new Map()
  groups.forEach((g) => {
    const key = `${g.min_age ?? ''}-${g.max_age ?? ''}`
    if (!bands.has(key)) bands.set(key, { key, groups: [] })
    bands.get(key).groups.push(g)
  })
  return [...bands.values()].map((b) => {
    // "U10 Boys" + "U10 Girls" -> "U10"; otherwise fall back to the age range
    const stripped = [...new Set(b.groups.map((g) => g.group_name.replace(/\s*[-–]?\s*(boys|girls|mixed)\s*$/i, '').trim()))]
    const title = stripped.length === 1 && stripped[0] ? stripped[0] : ageRangeLabel(b.groups[0])
    const apparatus = APPARATUS.filter((a) => b.groups.some((g) => g.apparatus.some((x) => x.value === a.value)))
    const members = b.groups.flatMap((g) => g.individuals.map((p) => ({ ...p, age_group_id: g.age_group_id, group_name: g.group_name })))
    return {
      key: b.key, title, apparatus,
      boys: members.filter((p) => p.gender === 'male'),
      girls: members.filter((p) => p.gender === 'female')
    }
  })
}

export const TopThreePerBand = ({ groups }) => {
  const bands = useMemo(() => ageBands(groups), [groups])
  return (
    <div className="space-y-8">
      {bands.map((b) => (
        <div key={b.key} className="break-inside-avoid">
          <h3 className="font-semibold text-lg mb-2">{b.title}</h3>
          <div className="grid gap-4 lg:grid-cols-2 print:grid-cols-2">
            {[['Boys', b.boys], ['Girls', b.girls]].map(([label, list]) => (
              <div key={label}>
                <h4 className="text-sm font-medium text-gray-600 mb-1">{label}</h4>
                {list.length === 0 ? <Empty>No {label.toLowerCase()} in this age group.</Empty> : (() => {
                  const top = topN(list, 3)
                  return top.length === 0 ? <Empty>No scores yet.</Empty>
                    : <PlayerTable players={top} apparatus={b.apparatus} />
                })()}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

/* ---------- 4. Top 3 of the whole competition ---------- */

export const TopThreeOverall = ({ groups }) => {
  const { apparatus, players } = useMemo(() => flattenResults(groups), [groups])
  const top = topN(players, 3)
  return top.length === 0 ? <Empty>No scores yet.</Empty>
    : <PlayerTable players={top} apparatus={apparatus} showGroup showGender />
}

/* ---------- 5–7. Best boy, best girl, best player ---------- */

export const BestPlayer = ({ groups, gender, title }) => {
  const { apparatus, players } = useMemo(() => flattenResults(groups), [groups])
  const pool = gender ? players.filter((p) => p.gender === gender) : players
  const winners = topN(pool, 1)
  if (winners.length === 0) return <Empty>No scores yet.</Empty>

  return (
    <div className="space-y-4">
      {winners.length > 1 && <p className="text-sm text-amber-700">Tie: {winners.length} players share the highest total.</p>}
      <div className="grid gap-4 md:grid-cols-2">
        {winners.map((p) => (
          <div key={`${p.age_group_id}-${p.player_id}`} className="rounded-xl border-2 border-yellow-300 bg-yellow-50 p-6 text-center break-inside-avoid">
            <div className="text-4xl">🏆</div>
            <div className="mt-1 text-xs uppercase tracking-wide text-yellow-800">{title}</div>
            <div className="mt-2 text-2xl font-bold" lang="mr">{p.name_marathi || p.name}</div>
            {p.name_marathi && <div className="text-gray-600">{p.name}</div>}
            <div className="mt-1 text-gray-700">{p.team_name}</div>
            <div className="text-sm text-gray-500">{p.group_name} · {playerGenderLabel(p.gender)}</div>
            <div className="mt-4 flex justify-center gap-6 text-sm">
              {apparatus.filter((a) => a.value in p.scores).map((a) => (
                <div key={a.value}>
                  <div className="text-gray-500">{shortApparatus(a.label)}</div>
                  <div className="font-semibold tabular-nums">{fmtScore(p.scores[a.value])}</div>
                </div>
              ))}
              <div>
                <div className="text-gray-500">Total</div>
                <div className="text-xl font-bold tabular-nums">{fmtScore(p.total)}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
