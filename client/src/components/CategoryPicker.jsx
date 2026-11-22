import { useMemo, useState } from 'react'
import { FiPlus, FiCheckSquare, FiSquare } from 'react-icons/fi'

const DISCIPLINES = [
  { value: 'pole', label: 'Pole (पुरलेला मल्लखांब)' },
  { value: 'rope', label: 'Rope (दोरीचा मल्लखांब)' },
  { value: 'hanging', label: 'Hanging (लटकता मल्लखांब)' }
]

/**
 * Pick one discipline and tick as many age groups as needed, then add them all at
 * once. Age groups already present for the chosen discipline are shown ticked and
 * disabled, so it is obvious what is left to add.
 *
 * onAdd(category, ageGroupIds[]) — the caller decides whether that means a local
 * list (creating a competition) or an API call (editing one).
 */
const CategoryPicker = ({ ageGroups = [], existing = [], onAdd, pending = false }) => {
  const [category, setCategory] = useState('pole')
  const [selected, setSelected] = useState([])

  // Age groups already attached to this discipline
  const takenIds = useMemo(
    () => existing.filter((e) => e.category === category).map((e) => Number(e.age_group_id)),
    [existing, category]
  )

  const selectable = ageGroups.filter((g) => !takenIds.includes(g.id))
  const allSelected = selectable.length > 0 && selected.length === selectable.length

  const toggle = (id) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const changeCategory = (value) => {
    setCategory(value)
    setSelected([])   // a different discipline has a different set already taken
  }

  const submit = () => {
    if (selected.length === 0) return
    onAdd(category, selected)
    setSelected([])
  }

  return (
    <div className="space-y-3 pt-3 border-t">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="label">Category</label>
          <select value={category} onChange={(e) => changeCategory(e.target.value)} className="input">
            {DISCIPLINES.map((d) => (
              <option key={d.value} value={d.value}>{d.label}</option>
            ))}
          </select>
        </div>

        <div className="flex items-end">
          <button
            type="button"
            onClick={submit}
            disabled={selected.length === 0 || pending}
            className="btn btn-primary w-full flex items-center justify-center gap-2"
          >
            <FiPlus className="w-4 h-4" />
            {pending
              ? 'Adding…'
              : selected.length === 0
                ? 'Select age groups'
                : `Add ${selected.length} age group${selected.length === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="label mb-0">Age Groups</label>
          {selectable.length > 0 && (
            <button
              type="button"
              onClick={() => setSelected(allSelected ? [] : selectable.map((g) => g.id))}
              className="text-xs text-primary-600 hover:underline"
            >
              {allSelected ? 'Clear all' : 'Select all'}
            </button>
          )}
        </div>

        {ageGroups.length === 0 ? (
          <p className="text-sm text-gray-500">No age groups defined yet.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {ageGroups.map((group) => {
              const taken = takenIds.includes(group.id)
              const checked = taken || selected.includes(group.id)
              return (
                <label
                  key={group.id}
                  title={taken ? `Already added for ${category}` : undefined}
                  className={`flex items-center gap-2 p-2 rounded-lg border text-sm ${
                    taken
                      ? 'bg-gray-50 border-gray-200 text-gray-400 cursor-not-allowed'
                      : checked
                        ? 'bg-primary-50 border-primary-400 cursor-pointer'
                        : 'border-gray-200 hover:border-gray-300 cursor-pointer'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={checked}
                    disabled={taken}
                    onChange={() => toggle(group.id)}
                  />
                  {checked
                    ? <FiCheckSquare className={`w-4 h-4 shrink-0 ${taken ? 'text-gray-400' : 'text-primary-600'}`} />
                    : <FiSquare className="w-4 h-4 shrink-0 text-gray-400" />}
                  <span className="min-w-0">
                    <span className="block truncate">{group.group_name?.trim()}</span>
                    <span className="block text-xs text-gray-400">
                      {group.min_age}–{group.max_age} yrs{taken ? ' · added' : ''}
                    </span>
                  </span>
                </label>
              )
            })}
          </div>
        )}

        {selectable.length === 0 && ageGroups.length > 0 && (
          <p className="text-xs text-gray-500 mt-2">
            Every age group is already added for {category}. Pick another category.
          </p>
        )}
      </div>
    </div>
  )
}

export default CategoryPicker
