import { useMemo, useState } from 'react'
import { useLiveTable } from '../lib/useLiveData'
import { supabase, AIRPORT_ID } from '../lib/supabase'
import { nextStatus, validateGateAssignment, ACTIVE_STATUSES, flightDurationMinutes } from '../lib/scheduler'
import { Button, Card, Spinner, StatusBadge, PriorityBadge, DelayBadge, Empty, fmtTime } from '../components/ui'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../lib/ToastContext'

const emptyForm = {
  flight_number: '',
  airline: '',
  origin: '',
  destination: '',
  scheduled_arrival: '',
  scheduled_departure: '',
  priority: 'normal',
  gate_id: '',
  arrival_runway_id: '',
  departure_runway_id: '',
}

export default function Flights() {
  const { rows: flights, loading } = useLiveTable('flights', 'scheduled_departure')
  const { rows: gates } = useLiveTable('gates', 'name')
  const { rows: runways } = useLiveTable('runways', 'name')
  const { isStaff, isAdmin } = useAuth()
  const toast = useToast()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [busy, setBusy] = useState(false)

  const gateName = (id) => gates.find((g) => g.id === id)?.name || '—'

  // Active flights first (by scheduled departure, same as the query order);
  // departed/cancelled ones sink to the bottom, ordered by how long they
  // actually took — they're done, they shouldn't crowd out what's still live.
  const sortedFlights = useMemo(() => {
    const active = flights.filter((f) => !['departed', 'cancelled'].includes(f.status))
    const done = [...flights.filter((f) => ['departed', 'cancelled'].includes(f.status))].sort((a, b) => {
      const da = flightDurationMinutes(a)
      const db = flightDurationMinutes(b)
      if (da == null && db == null) return 0
      if (da == null) return 1
      if (db == null) return -1
      return da - db
    })
    return [...active, ...done]
  }, [flights])

  // A gate's status is a real lock, not decoration — so it has to track
  // reality automatically. These two keep it in sync whenever a flight's
  // relationship to a gate changes, instead of leaving it stuck on
  // "occupied" forever after the flight that set it departs.
  async function occupyGate(gateId) {
    if (!gateId) return
    const gate = gates.find((g) => g.id === gateId)
    if (!gate || gate.status === 'closed' || gate.status === 'occupied') return
    await supabase.from('gates').update({ status: 'occupied' }).eq('id', gateId)
  }

  async function freeGateIfUnused(gateId, excludeFlightId) {
    if (!gateId) return
    const gate = gates.find((g) => g.id === gateId)
    if (!gate || gate.status === 'closed') return // an intentional closure isn't ours to undo
    const stillUsed = flights.some(
      (f) => f.id !== excludeFlightId && f.gate_id === gateId && ACTIVE_STATUSES.includes(f.status)
    )
    if (!stillUsed && gate.status !== 'available') {
      await supabase.from('gates').update({ status: 'available' }).eq('id', gateId)
    }
  }

  // Build the gate picklist for a given flight (or a draft, for the create
  // form): check every gate against the same hard rule the save will enforce,
  // then sort so free gates are on top and blocked ones sink to the bottom,
  // greyed out with the reason right in the label — no clicking to find out.
  function buildGateOptions(draftFlight) {
    const scored = gates.map((g) => {
      const check = validateGateAssignment(draftFlight, g.id, flights, gates)
      return { gate: g, blocked: !check.ok, reason: check.reason }
    })
    scored.sort((a, b) => {
      if (a.blocked !== b.blocked) return a.blocked ? 1 : -1
      return a.gate.name.localeCompare(b.gate.name)
    })
    return scored
  }

  async function createFlight(e) {
    e.preventDefault()
    if (!form.flight_number || !form.airline || !form.origin || !form.destination) {
      toast.error('Flight number, airline, origin and destination are required.')
      return
    }
    setBusy(true)
    try {
      const payload = {
        airport_id: AIRPORT_ID,
        flight_number: form.flight_number.toUpperCase(),
        airline: form.airline,
        origin: form.origin.toUpperCase(),
        destination: form.destination.toUpperCase(),
        scheduled_arrival: form.scheduled_arrival || null,
        scheduled_departure: form.scheduled_departure || null,
        priority: form.priority,
        gate_id: form.gate_id || null,
        arrival_runway_id: form.arrival_runway_id || null,
        departure_runway_id: form.departure_runway_id || null,
      }

      // Hard rule, enforced here (not just flagged after the fact): a flight
      // can't go on a closed gate, and can't overlap another flight already
      // sitting at the same gate.
      if (payload.gate_id) {
        const check = validateGateAssignment(
          { id: 'new', scheduled_arrival: payload.scheduled_arrival, scheduled_departure: payload.scheduled_departure },
          payload.gate_id,
          flights,
          gates
        )
        if (!check.ok) {
          toast.error(check.reason)
          setBusy(false)
          return
        }
      }

      const { error } = await supabase.from('flights').insert(payload)
      if (error) throw error
      if (payload.gate_id) await occupyGate(payload.gate_id)
      toast.success(`${payload.flight_number} added to schedule.`)
      setForm(emptyForm)
      setShowForm(false)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function advanceStatus(flight) {
    const next = nextStatus(flight.status)
    if (next === flight.status) return

    // A gate can be closed out from under a flight already assigned to it
    // (e.g. an emergency closure). Don't let that flight board or depart
    // from a gate that's now closed — it has to be reassigned first.
    if (['boarding', 'departed'].includes(next) && flight.gate_id) {
      const gate = gates.find((g) => g.id === flight.gate_id)
      if (gate?.status === 'closed') {
        toast.error(`${gate.name} is closed — reassign ${flight.flight_number} to another gate before it can ${next === 'departed' ? 'depart' : 'board'}.`)
        return
      }
    }

    const patch = { status: next, updated_at: new Date().toISOString() }
    if (next === 'landed') patch.actual_arrival = new Date().toISOString()
    if (next === 'departed') patch.actual_departure = new Date().toISOString()
    const { error } = await supabase.from('flights').update(patch).eq('id', flight.id)
    if (error) {
      toast.error(error.message)
      return
    }
    // Departing is the one transition that actually frees the gate — a
    // departed flight no longer has any claim on it.
    if (next === 'departed' && flight.gate_id) {
      await freeGateIfUnused(flight.gate_id, flight.id)
    }
  }

  async function assignGate(flight, gateId) {
    // Same hard rule as creation: block closed gates and overlapping flights
    // instead of just warning about them after the write.
    const check = validateGateAssignment(flight, gateId, flights, gates)
    if (!check.ok) {
      toast.error(check.reason)
      return
    }
    const previousGateId = flight.gate_id
    const { error } = await supabase.from('flights').update({ gate_id: gateId || null }).eq('id', flight.id)
    if (error) {
      toast.error(error.message)
      return
    }
    if (gateId) {
      await occupyGate(gateId)
      toast.success(`${flight.flight_number} assigned to ${gates.find((g) => g.id === gateId)?.name}.`)
    }
    if (previousGateId && previousGateId !== gateId) {
      await freeGateIfUnused(previousGateId, flight.id)
    }
  }

  async function cancelFlight(flight) {
    if (!confirm(`Cancel flight ${flight.flight_number}?`)) return
    const { error } = await supabase.from('flights').update({ status: 'cancelled' }).eq('id', flight.id)
    if (error) {
      toast.error(error.message)
      return
    }
    if (flight.gate_id) await freeGateIfUnused(flight.gate_id, flight.id)
    toast.info(`${flight.flight_number} cancelled.`)
  }

  async function deleteFlight(flight) {
    if (!confirm(`Permanently delete ${flight.flight_number}? This cannot be undone.`)) return
    const { error } = await supabase.from('flights').delete().eq('id', flight.id)
    if (error) {
      toast.error(error.message)
      return
    }
    if (flight.gate_id) await freeGateIfUnused(flight.gate_id, flight.id)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {isStaff && (
        <div className="flex justify-end">
          <Button onClick={() => setShowForm((s) => !s)}>{showForm ? 'Cancel' : '+ Add flight'}</Button>
        </div>
      )}

      {showForm && (
        <Card className="p-4">
          <form onSubmit={createFlight} className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Field label="Flight #"><input className="input" value={form.flight_number} onChange={(e) => setForm({ ...form, flight_number: e.target.value })} /></Field>
            <Field label="Airline"><input className="input" value={form.airline} onChange={(e) => setForm({ ...form, airline: e.target.value })} /></Field>
            <Field label="Origin"><input className="input" value={form.origin} onChange={(e) => setForm({ ...form, origin: e.target.value })} /></Field>
            <Field label="Destination"><input className="input" value={form.destination} onChange={(e) => setForm({ ...form, destination: e.target.value })} /></Field>
            <Field label="Sched. arrival"><input type="datetime-local" className="input" value={form.scheduled_arrival} onChange={(e) => setForm({ ...form, scheduled_arrival: e.target.value })} /></Field>
            <Field label="Sched. departure"><input type="datetime-local" className="input" value={form.scheduled_departure} onChange={(e) => setForm({ ...form, scheduled_departure: e.target.value })} /></Field>
            <Field label="Priority">
              <select className="input" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                <option value="normal">Normal</option>
                <option value="vip">VIP</option>
                <option value="emergency">Emergency</option>
              </select>
            </Field>
            <Field label="Gate">
              <select className="input" value={form.gate_id} onChange={(e) => setForm({ ...form, gate_id: e.target.value })}>
                <option value="">Unassigned</option>
                {buildGateOptions({
                  id: 'new',
                  scheduled_arrival: form.scheduled_arrival || null,
                  scheduled_departure: form.scheduled_departure || null,
                }).map(({ gate: g, blocked, reason }) => (
                  <option key={g.id} value={g.id} disabled={blocked} title={reason || ''}>
                    {blocked ? '🔒 ' : ''}{g.name}{blocked ? ' — in use' : ''}
                  </option>
                ))}
              </select>
            </Field>
            <div className="col-span-2 md:col-span-4 flex justify-end">
              <Button type="submit" disabled={busy}>{busy ? <Spinner /> : 'Create flight'}</Button>
            </div>
          </form>
        </Card>
      )}

      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-ink-faint text-xs uppercase tracking-wide">
                <th className="text-left px-4 py-2.5 font-semibold">Flight</th>
                <th className="text-left px-4 py-2.5 font-semibold">Route</th>
                <th className="text-left px-4 py-2.5 font-semibold">Status</th>
                <th className="text-left px-4 py-2.5 font-semibold">Gate</th>
                <th className="text-left px-4 py-2.5 font-semibold">Departure</th>
                <th className="text-left px-4 py-2.5 font-semibold">Delay</th>
                <th className="text-left px-4 py-2.5 font-semibold">Duration</th>
                {isStaff && <th className="text-right px-4 py-2.5 font-semibold">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {sortedFlights.map((f) => (
                <tr key={f.id} className="border-b border-line/60 last:border-b-0 hover:bg-bg-raised/40">
                  <td className="px-4 py-2.5 font-mono font-bold text-brand-200">{f.flight_number} <PriorityBadge priority={f.priority} /></td>
                  <td className="px-4 py-2.5 text-ink-dim">{f.origin} → {f.destination}</td>
                  <td className="px-4 py-2.5"><StatusBadge status={f.status} /></td>
                  <td className="px-4 py-2.5">
                    {isStaff ? (
                      <select
                        className="bg-bg-raised border border-line rounded-md px-2 py-1 text-xs"
                        value={f.gate_id || ''}
                        onChange={(e) => assignGate(f, e.target.value)}
                      >
                        <option value="">Unassigned</option>
                        {buildGateOptions(f).map(({ gate: g, blocked, reason }) => (
                          <option key={g.id} value={g.id} disabled={blocked} title={reason || ''}>
                            {blocked ? '🔒 ' : ''}{g.name}{blocked ? ' — in use' : ''}
                          </option>
                        ))}
                      </select>
                    ) : (
                      gateName(f.gate_id)
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-ink-dim">{fmtTime(f.estimated_departure || f.scheduled_departure)}</td>
                  <td className="px-4 py-2.5"><DelayBadge minutes={f.delay_minutes} /></td>
                  <td className="px-4 py-2.5 text-ink-faint text-xs">
                    {['departed', 'cancelled'].includes(f.status) && flightDurationMinutes(f) != null
                      ? `${flightDurationMinutes(f)}m`
                      : '—'}
                  </td>
                  {isStaff && (
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex gap-1.5 justify-end">
                        {!['departed', 'cancelled'].includes(f.status) && (
                          <Button variant="secondary" className="!px-2 !py-1 text-xs" onClick={() => advanceStatus(f)}>
                            Advance →
                          </Button>
                        )}
                        {!['departed', 'cancelled'].includes(f.status) && (
                          <Button variant="ghost" className="!px-2 !py-1 text-xs" onClick={() => cancelFlight(f)}>
                            Cancel
                          </Button>
                        )}
                        {isAdmin && (
                          <Button variant="danger" className="!px-2 !py-1 text-xs" onClick={() => deleteFlight(f)}>
                            Delete
                          </Button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {flights.length === 0 && <Empty>No flights yet.</Empty>}
        </div>
      </Card>
      <style>{`.input{background:#11291d;border:1px solid #143826;border-radius:0.5rem;padding:0.45rem 0.6rem;font-size:0.875rem;color:#e6fbf1}.input:focus{outline:none;border-color:#0a9459}`}</style>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-ink-faint font-medium">
      {label}
      {children}
    </label>
  )
}