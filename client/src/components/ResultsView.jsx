import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FiRefreshCw } from 'react-icons/fi'
import api from '../services/api'
import { ageRangeLabel, fmtScore } from '../utils/competition'
import { BestPlayer, OverallResult, TopFourPerGroup, TopThreeOverall, TopThreePerBand } from './ResultLists'

const MEDAL = { 1: '🥇', 2: '🥈', 3: '🥉' }

const RankCell = ({ rank }) => (
  <td className="px-3 py-2 text-center w-14 whitespace-nowrap">
    {rank === null ? <span className="text-gray-300">–</span> : (
      <span className="font-semibold">{MEDAL[rank] || rank}</span>
    )}
  </td>
)

const rowTone = (rank) =>
  rank === 1 ? 'bg-yellow-50' : rank === 2 ? 'bg-gray-50' : rank === 3 ? 'bg-orange-50/60' : ''

const Section = ({ title, children }) => (
  <div>
    <h3 className="font-semibold mb-2">{title}</h3>
    <div className="overflow-x-auto border rounded-lg">{children}</div>
  </div>
)

const AgeGroupResults = ({ group }) => {
  const { apparatus, individuals, teams, progress } = group
  const pct = progress.rows_total ? Math.round((progress.rows_scored / progress.rows_total) * 100) : 0

  return (
    <div className="space-y-6">
      <div>
        <div className="flex justify-between text-sm text-gray-600 mb-1">
          <span>
            {group.gender_label} · {ageRangeLabel(group)} · {apparatus.map((a) => a.label).join(', ')}
          </span>
          <span>{progress.rows_scored} / {progress.rows_total} performances scored</span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full bg-primary-500 transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <Section title="Individual ranking">
        {individuals.length === 0 ? (
          <p className="text-center text-gray-500 py-6 text-sm">No players in this age group.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="table-header">
                <th className="px-3 py-2 text-center">Rank</th>
                <th className="px-3 py-2">Player</th>
                <th className="px-3 py-2">Team</th>
                {apparatus.map((a) => <th key={a.value} className="px-3 py-2 text-right">{a.label.replace(' Mallakhamb', '')}</th>)}
                <th className="px-3 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {individuals.map((p) => (
                <tr key={p.player_id} className={rowTone(p.rank)}>
                  <RankCell rank={p.rank} />
                  <td className="px-3 py-2 font-medium whitespace-nowrap">
                    {p.name}
                    {p.name_marathi && <span className="block text-xs font-normal text-gray-500" lang="mr">{p.name_marathi}</span>}
                  </td>
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{p.team_name}</td>
                  {apparatus.map((a) => (
                    <td key={a.value} className="px-3 py-2 text-right tabular-nums">{fmtScore(p.scores[a.value])}</td>
                  ))}
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">{fmtScore(p.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section title="Team ranking">
        {teams.length === 0 ? (
          <p className="text-center text-gray-500 py-6 text-sm">No teams in this age group.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="table-header">
                <th className="px-3 py-2 text-center">Rank</th>
                <th className="px-3 py-2">Team</th>
                <th className="px-3 py-2 text-right">Players</th>
                {apparatus.map((a) => <th key={a.value} className="px-3 py-2 text-right">{a.label.replace(' Mallakhamb', '')}</th>)}
                <th className="px-3 py-2 text-right">Team score</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {teams.map((t) => (
                <tr key={t.team_id} className={rowTone(t.rank)}>
                  <RankCell rank={t.rank} />
                  <td className="px-3 py-2 font-medium whitespace-nowrap">{t.team_name}</td>
                  <td className="px-3 py-2 text-right">{t.players}</td>
                  {apparatus.map((a) => (
                    <td key={a.value} className="px-3 py-2 text-right tabular-nums">{fmtScore(t.scores[a.value])}</td>
                  ))}
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">{fmtScore(t.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </div>
  )
}

const OverallTeams = ({ teams, groups }) => (
  <Section title="Overall team standings (all age groups)">
    {teams.length === 0 ? (
      <p className="text-center text-gray-500 py-6 text-sm">No teams yet.</p>
    ) : (
      <table className="w-full text-sm">
        <thead>
          <tr className="table-header">
            <th className="px-3 py-2 text-center">Rank</th>
            <th className="px-3 py-2">Team</th>
            {groups.map((g) => <th key={g.age_group_id} className="px-3 py-2 text-right whitespace-nowrap">{g.group_name}</th>)}
            <th className="px-3 py-2 text-right">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {teams.map((t) => (
            <tr key={t.team_id} className={rowTone(t.rank)}>
              <RankCell rank={t.rank} />
              <td className="px-3 py-2 font-medium whitespace-nowrap">{t.team_name}</td>
              {groups.map((g) => (
                <td key={g.age_group_id} className="px-3 py-2 text-right tabular-nums">
                  {g.age_group_id in t.by_age_group ? fmtScore(t.by_age_group[g.age_group_id]) : ''}
                </td>
              ))}
              <td className="px-3 py-2 text-right font-semibold tabular-nums">{fmtScore(t.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )}
  </Section>
)

const TABS = [
  { key: 'overall-result', label: 'Overall result' },
  { key: 'top4', label: 'Top 4 per age group' },
  { key: 'top3-groups', label: 'Top 3 age group wise' },
  { key: 'top3', label: 'Top 3 overall' },
  { key: 'best-boy', label: 'Best player – boy' },
  { key: 'best-girl', label: 'Best player – girl' },
  { key: 'best', label: 'Best player' },
  { key: 'groups', label: 'Age groups & teams' },
  { key: 'teams', label: 'Overall teams' }
]

const TabButton = ({ active, onClick, children, small = false }) => (
  <button
    role="tab"
    aria-selected={active}
    onClick={onClick}
    className={`${small ? 'px-3 py-1.5' : 'px-4 py-2'} rounded-lg text-sm font-medium transition-colors ${
      active ? 'bg-primary-600 text-white' : 'bg-white border text-gray-700 hover:bg-gray-50'
    }`}
  >
    {children}
  </button>
)

/**
 * Results in tabs: the full list, the prize lists (top 4 / top 3 / best players), and
 * age-group-wise individual and team rankings. Refreshed every few seconds so they
 * follow the scorer's saves. `endpoint` is the public or the admin results URL.
 */
const ResultsView = ({ endpoint, live = true }) => {
  const [tab, setTab] = useState('overall-result')
  const [groupTab, setGroupTab] = useState(null)

  const { data, isLoading, isError, isFetching, dataUpdatedAt, refetch } = useQuery({
    queryKey: ['results', endpoint],
    queryFn: async () => (await api.get(endpoint)).data.data,
    refetchInterval: live ? 5000 : false,
    refetchIntervalInBackground: false
  })

  if (isLoading) return <div className="text-center py-16 text-gray-500">Loading results…</div>
  if (isError) return <div className="card text-center text-red-600">Could not load results.</div>

  const groups = data.age_groups
  const activeGroup = groupTab ?? (groups[0] ? String(groups[0].age_group_id) : null)
  const current = groups.find((g) => String(g.age_group_id) === activeGroup)
  const tabLabel = TABS.find((t) => t.key === tab)?.label

  let body
  switch (tab) {
    case 'overall-result': body = <OverallResult groups={groups} />; break
    case 'top4': body = <TopFourPerGroup groups={groups} />; break
    case 'top3-groups': body = <TopThreePerBand groups={groups} />; break
    case 'top3': body = <TopThreeOverall groups={groups} />; break
    case 'best-boy': body = <BestPlayer groups={groups} gender="male" title="Best player – boy" />; break
    case 'best-girl': body = <BestPlayer groups={groups} gender="female" title="Best player – girl" />; break
    case 'best': body = <BestPlayer groups={groups} title="Best player" />; break
    case 'teams': body = <OverallTeams teams={data.overall_teams} groups={groups} />; break
    default:
      body = (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2 print:hidden" role="tablist">
            {groups.map((g) => (
              <TabButton key={g.age_group_id} small active={activeGroup === String(g.age_group_id)} onClick={() => setGroupTab(String(g.age_group_id))}>
                {g.group_name}
              </TabButton>
            ))}
          </div>
          {current && <h3 className="hidden print:block font-semibold text-lg">{current.group_name}</h3>}
          {current ? <AgeGroupResults group={current} /> : <p className="text-center text-gray-500 py-6">No age groups.</p>}
        </div>
      )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <div className="flex flex-wrap gap-2" role="tablist">
          {TABS.map((t) => (
            <TabButton key={t.key} active={tab === t.key} onClick={() => setTab(t.key)}>{t.label}</TabButton>
          ))}
        </div>
        <button
          onClick={() => refetch()}
          className="text-xs text-gray-500 inline-flex items-center gap-1 hover:text-gray-800"
          title="Refresh now"
        >
          <FiRefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          {live ? 'Live · ' : ''}updated {new Date(dataUpdatedAt).toLocaleTimeString()}
        </button>
      </div>

      <h2 className="hidden print:block text-xl font-bold">{tabLabel}</h2>
      <div className="card print:shadow-none print:border-0 print:p-0">{body}</div>

      <p className="text-xs text-gray-500">
        Player total = sum of the player's final scores (अंतिम गुण) across the apparatus of their age group.
        {data.team_best_count
          ? ` Team score = on each apparatus, the sum of the team's best ${data.team_best_count} final scores, added up over the apparatus.`
          : " Team score = sum of its players' final scores."}
        {' '}Equal totals share a rank, so a top-3 list can hold more than 3 players when there is a tie.
      </p>
    </div>
  )
}

export default ResultsView
