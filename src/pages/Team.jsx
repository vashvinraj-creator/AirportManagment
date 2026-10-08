import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Card, RoleBadge, Spinner, Empty } from '../components/ui'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../lib/ToastContext'

export default function Team() {
  const [profiles, setProfiles] = useState([])
  const [loading, setLoading] = useState(true)
  const { user, isAdmin } = useAuth()
  const toast = useToast()

  async function load() {
    setLoading(true)
    const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: true })
    if (error) toast.error(error.message)
    else setProfiles(data || [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  async function changeRole(profile, role) {
    const { error } = await supabase.from('profiles').update({ role }).eq('id', profile.id)
    if (error) toast.error(error.message)
    else {
      toast.success(`${profile.full_name || 'User'} is now ${role.replace('_', ' ')}.`)
      load()
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner />
      </div>
    )
  }

  return (
    <Card className="p-0 overflow-hidden">
      <div className="px-4 py-3 border-b border-line text-sm font-semibold text-ink-dim">
        Team & roles {!isAdmin && <span className="text-ink-faint font-normal">(read-only — admin can change roles)</span>}
      </div>
      <div className="divide-y divide-line/60">
        {profiles.map((p) => (
          <div key={p.id} className="px-4 py-3 flex items-center gap-3">
            <span className="text-sm font-medium text-ink flex-1">
              {p.full_name || 'Unnamed'} {p.id === user?.id && <span className="text-ink-faint text-xs">(you)</span>}
            </span>
            {isAdmin ? (
              <select
                value={p.role}
                onChange={(e) => changeRole(p, e.target.value)}
                className="bg-bg-raised border border-line rounded-md px-2 py-1 text-xs"
              >
                <option value="viewer">Viewer</option>
                <option value="ground_staff">Ground Staff</option>
                <option value="admin">Admin</option>
              </select>
            ) : (
              <RoleBadge role={p.role} />
            )}
          </div>
        ))}
        {profiles.length === 0 && <Empty>No team members yet.</Empty>}
      </div>
    </Card>
  )
}
