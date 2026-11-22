// Scoring rules for the गुणपत्रिका score sheet, kept in one place so the API,
// rankings and any future report all agree.

// The five score columns on the sheet, in printed order.
const JUDGE_COLUMNS = [
  { field: 'head_judge_score', label: 'प्रमुख पंच', short: 'Head Judge' },
  { field: 'judge1_score', label: 'पंच क्र. 1', short: 'Judge 1' },
  { field: 'judge2_score', label: 'पंच क्र. 2', short: 'Judge 2' },
  { field: 'judge3_score', label: 'पंच क्र. 3', short: 'Judge 3' },
  { field: 'judge4_score', label: 'पंच क्र. 4', short: 'Judge 4' }
];

const JUDGE_FIELDS = JUDGE_COLUMNS.map((c) => c.field);

// Highest score a single judge may award.
const MAX_JUDGE_SCORE = 10;

const SET_TYPES = [
  { value: 'compulsory', label: 'अनिवार्य संच (Compulsory set)' },
  { value: 'optional', label: 'ऐच्छिक संच (Optional set)' }
];

const toNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const round = (value, places = 3) =>
  value === null ? null : Number(Math.round(value * 10 ** places) / 10 ** places);

// The four panel judges (पंच क्र. 1–4). The head judge (प्रमुख पंच) is recorded
// on the sheet but is not part of the average.
const PANEL_FIELDS = ['judge1_score', 'judge2_score', 'judge3_score', 'judge4_score'];

/**
 * Which panel scores are struck out (circled on the paper sheet): the highest
 * and the lowest of judges 1–4. Needs at least three panel scores; with ties
 * the first judge holding that score is the one struck out.
 * Returns { high, low } as field names, or nulls.
 */
const droppedJudges = (row) => {
  const present = PANEL_FIELDS
    .map((field) => ({ field, score: toNumber(row[field]) }))
    .filter((s) => s.score !== null);
  if (present.length < 3) return { high: null, low: null };

  let low = present[0];
  for (const s of present) if (s.score < low.score) low = s;
  let high = null;
  for (const s of present) {
    if (s.field === low.field) continue;
    if (!high || s.score > high.score) high = s;
  }
  return { high: high.field, low: low.field };
};

/**
 * सरासरी — of judges 1–4, strike out the highest and the lowest and average the
 * remaining two. The head judge's score is not counted. With fewer than three
 * panel scores entered nothing is struck out and those present are averaged.
 */
const calculateAverage = (row) => {
  const { high, low } = droppedJudges(row);
  const counted = PANEL_FIELDS
    .filter((f) => f !== high && f !== low)
    .map((f) => toNumber(row[f]))
    .filter((s) => s !== null);
  if (counted.length === 0) return null;
  return round(counted.reduce((sum, s) => sum + s, 0) / counted.length);
};

/** अंतिम गुण — सरासरी minus गुण कपात, never below zero. */
const calculateFinal = (average, deduction) => {
  if (average === null) return null;
  const applied = toNumber(deduction) || 0;
  return round(Math.max(0, average - applied));
};

/** A competition's "count the best N players" setting; null = everyone counts. */
const bestCountOf = (value) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
};

/**
 * The finals that count towards the team score: all of them, or only the best N
 * when the competition counts the best N players.
 */
const countedFinals = (finals, bestCount = null) => {
  const n = bestCountOf(bestCount);
  const sorted = finals.filter((s) => s !== null).sort((a, b) => b - a);
  return n ? sorted.slice(0, n) : sorted;
};

/** संघिक गुण — the sum of the अंतिम गुण on the sheet (best N only, when set). */
const calculateTeamPoints = (entries, bestCount = null) => {
  const finals = countedFinals(entries.map((e) => toNumber(e.final_score)), bestCount);
  if (finals.length === 0) return null;
  return round(finals.reduce((sum, s) => sum + s, 0), 3);
};

/** Recompute a row's derived values from its raw inputs. */
const deriveRow = (row) => {
  const average = calculateAverage(row);
  return { average_score: average, final_score: calculateFinal(average, row.deduction) };
};

module.exports = {
  JUDGE_COLUMNS,
  JUDGE_FIELDS,
  MAX_JUDGE_SCORE,
  SET_TYPES,
  toNumber,
  PANEL_FIELDS,
  droppedJudges,
  calculateAverage,
  calculateFinal,
  bestCountOf,
  countedFinals,
  calculateTeamPoints,
  deriveRow
};
