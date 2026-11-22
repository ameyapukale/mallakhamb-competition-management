import { useMemo, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import { FiInfo, FiUsers, FiArrowLeft } from 'react-icons/fi'

const CreateJudgePanel = () => {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [competitionId, setCompetitionId] = useState('')
  const [category, setCategory] = useState('')
  const [ageGroupId, setAgeGroupId] = useState('')
  const [panelName, setPanelName] = useState('')
  const [panelNameEdited, setPanelNameEdited] = useState(false)
  const [assignments, setAssignments] = useState({})

  // Active competitions to build a panel for
  const { data: competitions } = useQuery({
    queryKey: ['admin-active-competitions'],
    queryFn: async () => {
      const res = await api.get('/competitions/judge/active')
      return res.data.data
    }
  })

  // Categories, age groups and registered judges for the chosen competition
  const { data: formData, isLoading: loadingForm } = useQuery({
    queryKey: ['panel-form-data', competitionId],
    queryFn: async () => {
      const res = await api.get(`/judge-panels/form-data/${competitionId}`)
      return res.data.data
    },
    enabled: !!competitionId
  })

  const positions = formData?.positions || []
  const judges = formData?.judges || []

  // Only the disciplines actually selected in this competition
  const categories = useMemo(() => {
    if (!formData?.categories) return []
    return [...new Set(formData.categories.map((c) => c.category))]
  }, [formData])

  // Only the age groups selected for the chosen discipline in this competition.
  // Gender is already encoded in the age group name (e.g. "U12 Boys").
  const ageGroups = useMemo(() => {
    if (!formData?.categories || !category) return []
    return formData.categories.filter((c) => c.category === category)
  }, [formData, category])

  const selectedCategoryRow = useMemo(
    () => ageGroups.find((c) => String(c.age_group_id) === String(ageGroupId)),
    [ageGroups, ageGroupId]
  )

  // An assignment is either { judgeId } or { name }. Accounts already picked for
  // another slot are not offered again.
  const takenJudgeIds = useMemo(
    () => new Set(
      Object.values(assignments)
        .filter((a) => a?.judgeId)
        .map((a) => String(a.judgeId))
    ),
    [assignments]
  )

  const assignedCount = Object.values(assignments)
    .filter((a) => a?.judgeId || a?.name?.trim())
    .length

  const buildDefaultName = (cat, row) =>
    cat && row ? `${cat.charAt(0).toUpperCase() + cat.slice(1)} – ${row.age_group_name.trim()}` : ''

  const syncName = (cat, row) => {
    if (panelNameEdited) return
    setPanelName(buildDefaultName(cat, row))
  }

  const resetForCompetition = (value) => {
    setCompetitionId(value)
    setCategory('')
    setAgeGroupId('')
    setAssignments({})
    if (!panelNameEdited) setPanelName('')
  }

  const handleCategoryChange = (value) => {
    setCategory(value)
    setAgeGroupId('')
    syncName(value, null)
  }

  const handleAgeGroupChange = (value) => {
    setAgeGroupId(value)
    const row = ageGroups.find((c) => String(c.age_group_id) === String(value))
    syncName(category, row)
  }

  // value is '' (clear), '__text__' (switch to typing), or a judge id
  const handleSelect = (position, value) => {
    setAssignments((prev) => {
      const next = { ...prev }
      if (value === '__text__') next[position] = { name: '' }
      else if (value) next[position] = { judgeId: value }
      else delete next[position]
      return next
    })
  }

  const handleTypedName = (position, name) => {
    setAssignments((prev) => ({ ...prev, [position]: { name } }))
  }

  const clearSlot = (position) => {
    setAssignments((prev) => {
      const next = { ...prev }
      delete next[position]
      return next
    })
  }

  const createMutation = useMutation({
    mutationFn: (payload) => api.post('/judge-panels', payload),
    onSuccess: (res) => {
      toast.success(res.data.message)
      queryClient.invalidateQueries({ queryKey: ['my-panels'] })
      queryClient.invalidateQueries({ queryKey: ['panel-form-data'] })
      navigate(`/panels/${res.data.data.panelId}`)
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || 'Failed to create panel')
    }
  })

  const handleSubmit = (e) => {
    e.preventDefault()

    if (!selectedCategoryRow) {
      toast.error('Select a category and age group')
      return
    }
    if (!panelName.trim()) {
      toast.error('Panel name is required')
      return
    }

    // Send { judge_id } for picked accounts and { name } for typed-in ones,
    // skipping slots left blank or typed and then cleared
    const payloadAssignments = {}
    for (const [position, value] of Object.entries(assignments)) {
      if (value?.judgeId) {
        payloadAssignments[position] = { judge_id: parseInt(value.judgeId, 10) }
      } else if (value?.name?.trim()) {
        payloadAssignments[position] = { name: value.name.trim() }
      }
    }

    createMutation.mutate({
      competition_id: parseInt(competitionId, 10),
      competition_category_id: selectedCategoryRow.competition_category_id,
      panel_name: panelName.trim(),
      assignments: payloadAssignments
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/panels')} className="p-2 rounded-lg hover:bg-gray-100">
          <FiArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold">Create Judge Panel</h1>
          <p className="text-gray-500">Assign registered judges to the panel positions</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Panel scope */}
        <div className="card space-y-4">
          <h2 className="text-lg font-semibold">Panel Details</h2>

          <div>
            <label className="label">Active Competition</label>
            <select
              value={competitionId}
              onChange={(e) => resetForCompetition(e.target.value)}
              className="input"
            >
              <option value="">Select a competition</option>
              {competitions?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.competition_name} ({c.registered_judges} judges registered)
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label">Category</label>
              <select
                value={category}
                onChange={(e) => handleCategoryChange(e.target.value)}
                className="input"
                disabled={!competitionId || loadingForm}
              >
                <option value="">
                  {competitionId ? 'Select category' : 'Select a competition first'}
                </option>
                {categories.map((c) => (
                  <option key={c} value={c} className="capitalize">{c}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="label">Age Group</label>
              <select
                value={ageGroupId}
                onChange={(e) => handleAgeGroupChange(e.target.value)}
                className="input"
                disabled={!category}
              >
                <option value="">{category ? 'Select age group' : 'Select a category first'}</option>
                {ageGroups.map((c) => (
                  <option key={c.age_group_id} value={c.age_group_id}>
                    {c.age_group_name.trim()} ({c.min_age}–{c.max_age} yrs)
                    {c.panel_count > 0 ? ` • ${c.panel_count} panel${c.panel_count === 1 ? '' : 's'} exist` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="label">Panel Name</label>
            <input
              type="text"
              value={panelName}
              onChange={(e) => { setPanelName(e.target.value); setPanelNameEdited(true) }}
              className="input"
              placeholder="e.g. Pole – U12 Boys"
            />
          </div>

          {competitionId && !loadingForm && categories.length === 0 && (
            <div className="flex items-start gap-2 text-sm text-amber-700 bg-amber-50 rounded-lg p-3">
              <FiInfo className="w-4 h-4 mt-0.5 shrink-0" />
              This competition has no categories yet. Add categories to it before creating a panel.
            </div>
          )}
        </div>

        {/* Position assignments */}
        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Panel Positions</h2>
            {competitionId && (
              <span className="text-sm text-gray-500">
                {assignedCount} of {positions.length} filled
              </span>
            )}
          </div>

          {!competitionId ? (
            <p className="text-gray-500 text-sm">Select a competition to load its registered judges.</p>
          ) : (
            <>
              {judges.length === 0 && (
                <div className="flex items-start gap-2 text-sm text-amber-700 bg-amber-50 rounded-lg p-3">
                  <FiUsers className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>
                    No judges have registered for this competition yet, so the judge dropdowns are
                    empty. Judges can register themselves, or you can{' '}
                    <Link
                      to={`/admin/register-judge?competition=${competitionId}`}
                      className="underline font-medium"
                    >
                      register one for them
                    </Link>. Scorer and Time Keeper can still be typed in below.
                  </span>
                </div>
              )}
              <p className="text-sm text-gray-500">
                Each position takes one person, and anyone already assigned is removed from the
                other dropdowns. Positions may be left empty and filled in later. Scorer and
                Time Keeper also accept a name typed in directly.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {positions.map((position) => {
                  const value = assignments[position.value]
                  const isTyping = value?.name !== undefined
                  const selectedId = value?.judgeId || ''

                  return (
                    <div key={position.value}>
                      <label className="label">
                        {position.label}
                        {position.allowsFreeText && (
                          <span className="ml-2 text-xs font-normal text-gray-400">
                            dropdown or typed name
                          </span>
                        )}
                      </label>

                      {isTyping ? (
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={value.name}
                            onChange={(e) => handleTypedName(position.value, e.target.value)}
                            className="input"
                            placeholder={`Type the ${position.label.toLowerCase()}'s name`}
                            maxLength={100}
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={() => clearSlot(position.value)}
                            className="btn btn-outline text-sm whitespace-nowrap px-3"
                            title="Back to the dropdown"
                          >
                            Clear
                          </button>
                        </div>
                      ) : (
                        <select
                          value={selectedId}
                          onChange={(e) => handleSelect(position.value, e.target.value)}
                          className="input"
                        >
                          <option value="">— Unassigned —</option>
                          {judges
                            .filter((j) => {
                              const id = String(j.judge_id)
                              return id === String(selectedId) || !takenJudgeIds.has(id)
                            })
                            .map((j) => (
                              <option key={j.judge_id} value={j.judge_id}>
                                {j.full_name} ({j.account_role})
                              </option>
                            ))}
                          {position.allowsFreeText && (
                            <option value="__text__">✏️ Enter a name instead…</option>
                          )}
                        </select>
                      )}
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={createMutation.isPending || !selectedCategoryRow}
            className="btn btn-primary"
          >
            {createMutation.isPending ? 'Creating...' : 'Create Panel'}
          </button>
          <button type="button" onClick={() => navigate('/panels')} className="btn btn-outline">
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}

export default CreateJudgePanel
