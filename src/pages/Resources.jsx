import { useEffect, useState } from 'react'
import { useLiveTable } from '../lib/useLiveData'
import { supabase, AIRPORT_ID } from '../lib/supabase'
import { validateGateClose, validateRunwayClose, validateCrewOffDuty } from '../lib/scheduler'
import { Button, Card, Empty } from '../components/ui'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../lib/ToastContext'

const STATUS_DOT = {
  available: 'bg-brand-400',
  operational: 'bg-brand-400',
  occupied: 'bg-warn',
  busy: 'bg-warn',
  closed: 'bg-danger',
  maintenance: 'bg-danger',
  off_duty: 'bg-ink-faint',
}

function ResourceColumn({ title, rows, statusOptions, onStatusChange, onAdd, onDelete, canWrite, canDelete, addFields }) {
  const [showAdd, setShowAdd] = useState(false)
  const [name, setName] = useState('')
  const [extra, setExtra] = useState(addFields?.[0]?.options?.[0] || '')
  const toast = useToast()

  async function handleAdd() {
    if (!name.trim()) {
      toast.error('Name is required.')
      return
    }
    await onAdd(name.trim(), extra)
    setName('')
    setShowAdd(false)
  }

  return (
    <Card className="p-0 overflow-hidden flex-1 min-w-[260px]">
      <div className="px-4 py-3 border-b border-line flex items-center justify-between">
        <span className="text-sm font-semibold text-ink-dim">{title}</span>
        {canWrite && (
          <button onClick={() => setShowAdd((s) => !s)} className="text-brand-300 text-xs font-semibold hover:text-brand-200">
            {showAdd ? 'Cancel' : '+ Add'}
          </button>
        )}
      </div>
      {showAdd && (
        <div className="p-3 border-b border-line flex gap-2 flex-wrap">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name"
            className="flex-1 min-w-[100px] bg-bg-raised border border-line rounded-md px-2 py-1.5 text-xs"
          />
          {addFields?.map((f) => (
            <select key={f.key} value={extra} onChange={(e) => setExtra(e.target.value)} className="bg-bg-raised border border-line rounded-md px-2 py-1.5 text-xs">
              {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          ))}
          <Button className="!px-2.5 !py-1.5 text-xs" onClick={handleAdd}>Save</Button>
        </div>
      )}
      <div className="divide-y divide-line/60 max-h-80 overflow-y-auto">
        {rows.map((r) => (
          <div key={r.id} className="px-4 py-2.5 flex items-center gap-2 text-sm">
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[r.status] || 'bg-ink-faint'}`} />
            <span className="font-mono font-semibold text-ink flex-1 truncate">{r.name}</span>
            {r.crew_type && <span className="text-ink-faint text-xs uppercase">{r.crew_type}</span>}
            {r.gate_type && <span className="text-ink-faint text-xs uppercase">{r.gate_type}</span>}
            {canWrite ? (
              <select
                value={r.status}
                onChange={(e) => onStatusChange(r, e.target.value)}
                className="bg-bg-raised border border-line rounded-md px-1.5 py-1 text-xs"
              >
                {statusOptions.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            ) : (
              <span className="text-xs text-ink-faint capitalize">{r.status}</span>
            )}
            {canDelete && (
              <button onClick={() => onDelete(r)} className="text-ink-faint hover:text-danger text-xs ml-1">✕</button>
            )}
          </div>
        ))}
        {rows.length === 0 && <Empty>Nothing here yet.</Empty>}
      </div>
    </Card>
  )
}

function useCrewAssignments() {
  const [rows, setRows] = useState([])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const { data, error } = await supabase.from('crew_assignments').select('*')
      if (!cancelled && !error) setRows(data || [])
    }
    load()
    const channel = supabase
      .channel('crew-assignments-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'crew_assignments' }, () => load())
      .subscribe()
    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [])

  return { rows }
}

export default function Resources() {
  const { rows: gates } = useLiveTable('gates', 'name')
  const { rows: runways } = useLiveTable('runways', 'name')
  const { rows: crews } = useLiveTable('crews', 'name')
  const { rows: flights } = useLiveTable('flights', 'scheduled_departure')
  const { rows: crewAssignments } = useCrewAssignments()
  const { isStaff, isAdmin } = useAuth()
  const toast = useToast()

  async function updateStatus(table, row, status) {
    // Enforce the same "can't lock out something still in use" rule across
    // every resource type: gates, runways, and crews.
    if (table === 'gates' && status === 'closed') {
      const check = validateGateClose(row.id, flights, gates)
      if (!check.ok) return toast.error(check.reason)
    }
    if (table === 'runways' && status !== 'operational') {
      const check = validateRunwayClose(row.id, flights, runways)
      if (!check.ok) return toast.error(check.reason)
    }
    if (table === 'crews' && status === 'off_duty') {
      const check = validateCrewOffDuty(row.id, crewAssignments, crews)
      if (!check.ok) return toast.error(check.reason)
    }
    const { error } = await supabase.from(table).update({ status }).eq('id', row.id)
    if (error) toast.error(error.message)
  }

  async function addRow(table, payload) {
    const { error } = await supabase.from(table).insert({ airport_id: AIRPORT_ID, ...payload })
    if (error) toast.error(error.message)
    else toast.success('Added.')
  }

  async function deleteRow(table, row) {
    // Don't let a resource be deleted out from under a flight that's
    // actively depending on it — same relationship rule as closing it.
    if (table === 'gates') {
      const check = validateGateClose(row.id, flights, gates)
      if (!check.ok) return toast.error(check.reason.replace('close', 'delete'))
    }
    if (table === 'runways') {
      const check = validateRunwayClose(row.id, flights, runways)
      if (!check.ok) return toast.error(check.reason.replace('close', 'delete'))
    }
    if (table === 'crews') {
      const check = validateCrewOffDuty(row.id, crewAssignments, crews)
      if (!check.ok) return toast.error(check.reason.replace('take', 'delete').replace('off duty', ''))
    }
    if (!confirm(`Delete ${row.name}?`)) return
    const { error } = await supabase.from(table).delete().eq('id', row.id)
    if (error) toast.error(error.message)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col md:flex-row gap-4">
        <ResourceColumn
          title={`Gates (${gates.length})`}
          rows={gates}
          statusOptions={['available', 'occupied', 'closed']}
          onStatusChange={(r, s) => updateStatus('gates', r, s)}
          onAdd={(name, type) => addRow('gates', { name, gate_type: type, status: 'available' })}
          onDelete={(r) => deleteRow('gates', r)}
          canWrite={isStaff}
          canDelete={isAdmin}
          addFields={[{ key: 'type', options: ['standard', 'jet_bridge', 'remote'] }]}
        />
        <ResourceColumn
          title={`Runways (${runways.length})`}
          rows={runways}
          statusOptions={['operational', 'maintenance', 'closed']}
          onStatusChange={(r, s) => updateStatus('runways', r, s)}
          onAdd={(name) => addRow('runways', { name, status: 'operational' })}
          onDelete={(r) => deleteRow('runways', r)}
          canWrite={isStaff}
          canDelete={isAdmin}
        />
      </div>
      <ResourceColumn
        title={`Ground crews (${crews.length})`}
        rows={crews}
        statusOptions={['available', 'busy', 'off_duty']}
        onStatusChange={(r, s) => updateStatus('crews', r, s)}
        onAdd={(name, type) => addRow('crews', { name, crew_type: type, status: 'available' })}
        onDelete={(r) => deleteRow('crews', r)}
        canWrite={isStaff}
        canDelete={isAdmin}
        addFields={[{ key: 'type', options: ['cleaning', 'refueling', 'baggage', 'catering'] }]}
      />
    </div>
  )
}