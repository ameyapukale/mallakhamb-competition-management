import { useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import { useAuthStore } from '../../store/authStore'
import { FiTrash2, FiArrowLeft, FiUser } from 'react-icons/fi'

const PanelDetail = () => {
  const { id } = useParams()
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const isAdmin = user?.role === 'admin'
  const [assigningPosition, setAssigningPosition] = useState(null)
  // Set to a position value while the admin is typing a name into that slot
  const [typingFor, setTypingFor] = useState(null)
  const [typedName, setTypedName] = useState('')

  const { data: panel, isLoading } = useQuery({
    queryKey: ['panel', id],
    queryFn: async () => {
      const res = await api.get(`/judge-panels/${id}`)
      return res.data.data
    }
  })

  // Registered judges for this panel's competition, to fill empty slots
  const { data: formData } = useQuery({
    queryKey: ['panel-form-data', panel?.competition_id],
    queryFn: async () => {
      const res = await api.get(`/judge-panels/form-data/${panel.competition_id}`)
      return res.data.data
    },
    enabled: isAdmin && !!panel?.competition_id
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['panel', id] })
    queryClient.invalidateQueries({ queryKey: ['my-panels'] })
  }

  const assignMutation = useMutation({
    mutationFn: (payload) => api.post(`/judge-panels/${id}/members`, payload),
    onSuccess: (res) => {
      toast.success(res.data.message)
      setAssigningPosition(null)
      setTypingFor(null)
      setTypedName('')
      invalidate()
    },
    onError: (error) => toast.error(error.response?.data?.message || 'Failed to assign')
  })

  const removeMutation = useMutation({
    mutationFn: (memberId) => api.delete(`/judge-panels/${id}/members/${memberId}`),
    onSuccess: () => {
      toast.success('Removed from panel')
      invalidate()
    },
    onError: (error) => toast.error(error.response?.data?.message || 'Failed to remove')
  })

  if (isLoading) {
    return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div></div>
  }

  if (!panel) {
    return <div className="card text-center py-12">Panel not found</div>
  }

  const positions = panel.positions || []
  const memberFor = (position) => panel.members?.find((m) => m.position === position)

  // Anyone already on this panel is not offered for the remaining slots
  const assignedIds = new Set((panel.members || []).map((m) => m.judge_id))
  const availableJudges = (formData?.judges || []).filter((j) => !assignedIds.has(j.judge_id))

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/panels')} className="p-2 rounded-lg hover:bg-gray-100">
          <FiArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{panel.panel_name}</h1>
          <p className="text-gray-500">
            {panel.competition_name} • <span className="capitalize">{panel.category}</span> — {panel.age_group_name?.trim()}
          </p>
        </div>
        {panel.my_position_label && (
          <span className="px-3 py-1 text-sm rounded-full bg-primary-100 text-primary-700 font-medium">
            You: {panel.my_position_label}
          </span>
        )}
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Panel Positions</h2>
          <span className="text-sm text-gray-500">
            {panel.members?.length || 0} of {positions.length} filled
          </span>
        </div>

        <div className="divide-y">
          {positions.map((position) => {
            const member = memberFor(position.value)
            const isMe = member?.judge_id === user?.id

            return (
              <div key={position.value} className="py-3 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-500">{position.label}</p>
                  {member ? (
                    <p className={`font-medium truncate ${isMe ? 'text-primary-700' : ''}`}>
                      {member.display_name}
                      {isMe && <span className="text-xs font-normal text-primary-600"> (you)</span>}
                      {member.is_external ? (
                        <span className="ml-2 text-xs font-normal text-gray-500 bg-gray-100 rounded-full px-2 py-0.5">
                          no account
                        </span>
                      ) : (
                        <span className="text-sm text-gray-400 font-normal"> · {member.email}</span>
                      )}
                    </p>
                  ) : (
                    <p className="text-gray-400 italic">Unassigned</p>
                  )}
                </div>

                {isAdmin && (
                  member ? (
                    <button
                      onClick={() => removeMutation.mutate(member.id)}
                      disabled={removeMutation.isPending}
                      className="p-2 text-red-500 hover:bg-red-50 rounded-lg disabled:opacity-50 shrink-0"
                      title={`Remove from ${position.label}`}
                    >
                      <FiTrash2 className="w-4 h-4" />
                    </button>
                  ) : assigningPosition === position.value ? (
                    <div className="flex items-center gap-2 shrink-0">
                      {typingFor === position.value ? (
                        <>
                          <input
                            type="text"
                            className="input py-1 text-sm max-w-[12rem]"
                            placeholder="Type a name"
                            value={typedName}
                            maxLength={100}
                            autoFocus
                            onChange={(e) => setTypedName(e.target.value)}
                          />
                          <button
                            onClick={() => assignMutation.mutate({
                              member_name: typedName.trim(),
                              position: position.value
                            })}
                            disabled={!typedName.trim() || assignMutation.isPending}
                            className="btn btn-primary text-sm py-1 px-3 disabled:opacity-50"
                          >
                            Save
                          </button>
                        </>
                      ) : (
                        <select
                          className="input py-1 text-sm max-w-[12rem]"
                          defaultValue=""
                          onChange={(e) => {
                            if (e.target.value === '__text__') {
                              setTypingFor(position.value)
                              setTypedName('')
                            } else if (e.target.value) {
                              assignMutation.mutate({
                                judge_id: parseInt(e.target.value, 10),
                                position: position.value
                              })
                            }
                          }}
                        >
                          <option value="">Select person</option>
                          {availableJudges.map((j) => (
                            <option key={j.judge_id} value={j.judge_id}>{j.full_name}</option>
                          ))}
                          {position.allowsFreeText && (
                            <option value="__text__">✏️ Enter a name instead…</option>
                          )}
                        </select>
                      )}
                      <button
                        onClick={() => { setAssigningPosition(null); setTypingFor(null); setTypedName('') }}
                        className="text-sm text-gray-500 hover:underline"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setAssigningPosition(position.value); setTypingFor(null) }}
                      className="btn btn-outline text-sm py-1 px-3 shrink-0"
                    >
                      Assign
                    </button>
                  )
                )}
              </div>
            )
          })}
        </div>

        {isAdmin && availableJudges.length === 0 && (panel.members?.length || 0) < positions.length && (
          <p className="mt-4 text-sm text-amber-700 bg-amber-50 rounded-lg p-3 flex items-start gap-2">
            <FiUser className="w-4 h-4 mt-0.5 shrink-0" />
            Every registered judge for this competition is already on this panel. More judges must
            register before the remaining positions can be filled.
          </p>
        )}
      </div>

      {['admin', 'scorer'].includes(user?.role) && (
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">Quick Actions</h2>
          <div className="flex flex-wrap gap-4">
            <Link to="/scoring" className="btn btn-primary">Go to Scoring</Link>
            <Link to={`/schedule/${panel.competition_id}`} className="btn btn-outline">View Schedule</Link>
          </div>
        </div>
      )}
    </div>
  )
}

export default PanelDetail
