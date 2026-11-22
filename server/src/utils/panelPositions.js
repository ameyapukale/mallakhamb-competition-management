// A competition counts as "active" for judge registration and panel visibility from
// the moment registration opens until it is completed or cancelled.
const ACTIVE_COMPETITION_STATUSES = ['registration_open', 'registration_closed', 'ongoing'];

// The seven panel slots, in the order they should appear in the UI.
// allowsFreeText tells the client which slots may take a typed-in name.
const PANEL_POSITIONS = [
  { value: 'judge_1', label: 'Judge No. 1', allowsFreeText: false },
  { value: 'judge_2', label: 'Judge No. 2', allowsFreeText: false },
  { value: 'judge_3', label: 'Judge No. 3', allowsFreeText: false },
  { value: 'judge_4', label: 'Judge No. 4', allowsFreeText: false },
  { value: 'judge_5', label: 'Judge No. 5', allowsFreeText: false },
  { value: 'scorer', label: 'Scorer', allowsFreeText: true },
  { value: 'time_keeper', label: 'Time Keeper', allowsFreeText: true }
];

const PANEL_POSITION_VALUES = PANEL_POSITIONS.map((p) => p.value);

const POSITION_LABELS = PANEL_POSITIONS.reduce((acc, p) => {
  acc[p.value] = p.label;
  return acc;
}, {});

// Slots that accept a typed-in name instead of a registered account. The Judge No. 1-5
// slots are excluded because they award scores, which requires an account that can log in.
const FREE_TEXT_POSITIONS = ['scorer', 'time_keeper'];

// Roles allowed to register for a competition and be assigned to a panel slot.
// Only judges now that the 'scorer' account role is retired; the Scorer and Time
// Keeper seats are filled by a judge, or by a typed-in name.
const PANEL_ELIGIBLE_ROLES = ['judge'];

// Reusable SQL fragment for "status IN (...)" over the active statuses.
const activeStatusPlaceholders = ACTIVE_COMPETITION_STATUSES.map(() => '?').join(', ');

module.exports = {
  ACTIVE_COMPETITION_STATUSES,
  PANEL_POSITIONS,
  PANEL_POSITION_VALUES,
  POSITION_LABELS,
  PANEL_ELIGIBLE_ROLES,
  FREE_TEXT_POSITIONS,
  activeStatusPlaceholders
};
