// Core scheduling / delay-cascade engine.
// Pure functions: given current flights + resources, detect conflicts and
// compute how a delay on one flight propagates to the gate/runway/crew it
// shares with other flights. Kept framework-free so it's easy to test.

const MIN_TURNAROUND_MS = 25 * 60 * 1000 // minimum realistic gate turnaround
const BUFFER_MS = 5 * 60 * 1000 // safety buffer between runway slots

function toMs(t) {
  return t ? new Date(t).getTime() : null
}

/** Detect gate conflicts: two flights occupying the same gate with overlapping windows. */
export function detectGateConflicts(flights) {
  const conflicts = []
  const byGate = {}
  for (const f of flights) {
    if (!f.gate_id) continue
    if (!['scheduled', 'approaching', 'landed', 'at_gate', 'turnaround', 'boarding'].includes(f.status)) continue
    byGate[f.gate_id] = byGate[f.gate_id] || []
    byGate[f.gate_id].push(f)
  }
  for (const gateId in byGate) {
    const list = byGate[gateId].sort((a, b) => (toMs(a.scheduled_arrival) || 0) - (toMs(b.scheduled_arrival) || 0))
    for (let i = 0; i < list.length - 1; i++) {
      const a = list[i]
      const b = list[i + 1]
      const aOut = toMs(a.estimated_departure) || toMs(a.scheduled_departure)
      const bIn = toMs(b.estimated_arrival) || toMs(b.scheduled_arrival)
      if (aOut != null && bIn != null && bIn < aOut + MIN_TURNAROUND_MS) {
        conflicts.push({
          type: 'gate',
          resourceId: gateId,
          flightA: a,
          flightB: b,
          overlapMinutes: Math.round((aOut + MIN_TURNAROUND_MS - bIn) / 60000),
        })
      }
    }
  }
  return conflicts
}

/** Detect runway conflicts: two flights needing the same runway within the buffer window. */
export function detectRunwayConflicts(flights) {
  const conflicts = []
  const slots = []
  for (const f of flights) {
    if (f.arrival_runway_id && (f.estimated_arrival || f.scheduled_arrival)) {
      slots.push({ runwayId: f.arrival_runway_id, time: toMs(f.estimated_arrival || f.scheduled_arrival), flight: f, kind: 'arrival' })
    }
    if (f.departure_runway_id && (f.estimated_departure || f.scheduled_departure)) {
      slots.push({ runwayId: f.departure_runway_id, time: toMs(f.estimated_departure || f.scheduled_departure), flight: f, kind: 'departure' })
    }
  }
  const byRunway = {}
  for (const s of slots) {
    byRunway[s.runwayId] = byRunway[s.runwayId] || []
    byRunway[s.runwayId].push(s)
  }
  for (const runwayId in byRunway) {
    const list = byRunway[runwayId].sort((a, b) => a.time - b.time)
    for (let i = 0; i < list.length - 1; i++) {
      const a = list[i]
      const b = list[i + 1]
      if (b.time - a.time < BUFFER_MS) {
        conflicts.push({
          type: 'runway',
          resourceId: runwayId,
          flightA: a.flight,
          flightB: b.flight,
          overlapMinutes: Math.round((BUFFER_MS - (b.time - a.time)) / 60000),
        })
      }
    }
  }
  return conflicts
}

export function detectAllConflicts(flights) {
  return [...detectGateConflicts(flights), ...detectRunwayConflicts(flights)]
}

export const ACTIVE_STATUSES = ['scheduled', 'approaching', 'landed', 'at_gate', 'turnaround', 'boarding']

/** Minutes between a flight's (actual, falling back to scheduled) arrival and departure. Null if we can't tell. */
export function flightDurationMinutes(f) {
  const start = f.actual_arrival || f.scheduled_arrival
  const end = f.actual_departure || f.scheduled_departure
  if (!start || !end) return null
  return Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000)
}

/**
 * Hard gate-assignment rule, enforced at the point of assignment (not just
 * flagged afterward): a flight cannot be put on a closed gate, and two
 * active flights cannot occupy the same gate with overlapping time windows
 * (including the minimum turnaround buffer). Returns { ok: true } or
 * { ok: false, reason } so the caller can block the write and explain why.
 */
export function validateGateAssignment(flight, gateId, allFlights, gates) {
  if (!gateId) return { ok: true } // unassigning is always fine
  const gate = gates.find((g) => g.id === gateId)
  if (!gate) return { ok: false, reason: 'That gate no longer exists.' }
  if (gate.status === 'closed') {
    return { ok: false, reason: `Gate ${gate.name} is closed and can't accept flights. Reopen it first.` }
  }

  const myArr = toMs(flight.estimated_arrival || flight.scheduled_arrival)
  const myDep = toMs(flight.estimated_departure || flight.scheduled_departure)

  const others = allFlights.filter(
    (f) => f.id !== flight.id && f.gate_id === gateId && ACTIVE_STATUSES.includes(f.status)
  )

  for (const other of others) {
    const otherArr = toMs(other.estimated_arrival || other.scheduled_arrival)
    const otherDep = toMs(other.estimated_departure || other.scheduled_departure)
    // If either flight is missing a time, fall back to treating it as a hard
    // conflict only when both occupy the gate with no way to prove they don't
    // overlap — i.e. be conservative and block it.
    if (myArr == null || myDep == null || otherArr == null || otherDep == null) {
      return {
        ok: false,
        reason: `${other.flight_number} is already on ${gate.name} and doesn't have full schedule times to check for overlap — assign times first or pick another gate.`,
      }
    }
    const overlaps = myArr < otherDep + MIN_TURNAROUND_MS && otherArr < myDep + MIN_TURNAROUND_MS
    if (overlaps) {
      return {
        ok: false,
        reason: `${other.flight_number} already occupies ${gate.name} during an overlapping window (needs a ${MIN_TURNAROUND_MS / 60000}-minute turnaround buffer). Pick a different gate or time.`,
      }
    }
  }

  return { ok: true }
}

/** Can this gate be closed right now? Blocks it if an active flight is still parked there. */
export function validateGateClose(gateId, allFlights, gates) {
  const gate = gates.find((g) => g.id === gateId)
  if (!gate) return { ok: false, reason: 'That gate no longer exists.' }
  const occupying = allFlights.find((f) => f.gate_id === gateId && ACTIVE_STATUSES.includes(f.status))
  if (occupying) {
    return {
      ok: false,
      reason: `Can't close ${gate.name} — ${occupying.flight_number} is still assigned to it. Reassign or advance that flight first.`,
    }
  }
  return { ok: true }
}

/**
 * Same rule as gates, applied to runways: a flight can't be slotted onto a
 * runway that's closed or under maintenance, and two flights can't use the
 * same runway within the safety buffer. `kind` is 'arrival' or 'departure'
 * so the right timestamp is checked.
 */
export function validateRunwayAssignment(flight, runwayId, kind, allFlights, runways) {
  if (!runwayId) return { ok: true }
  const runway = runways.find((r) => r.id === runwayId)
  if (!runway) return { ok: false, reason: 'That runway no longer exists.' }
  if (runway.status !== 'operational') {
    return { ok: false, reason: `${runway.name} is ${runway.status.replace('_', ' ')} and can't take new slots.` }
  }

  const myTime = toMs(
    kind === 'arrival'
      ? flight.estimated_arrival || flight.scheduled_arrival
      : flight.estimated_departure || flight.scheduled_departure
  )
  if (myTime == null) return { ok: true } // nothing to check against without a time

  const field = kind === 'arrival' ? 'arrival_runway_id' : 'departure_runway_id'
  const others = allFlights.filter(
    (f) => f.id !== flight.id && f[field] === runwayId && ACTIVE_STATUSES.includes(f.status)
  )
  for (const other of others) {
    const otherTime = toMs(
      kind === 'arrival'
        ? other.estimated_arrival || other.scheduled_arrival
        : other.estimated_departure || other.scheduled_departure
    )
    if (otherTime == null) continue
    if (Math.abs(myTime - otherTime) < BUFFER_MS) {
      return {
        ok: false,
        reason: `${other.flight_number} already has a slot on ${runway.name} within ${BUFFER_MS / 60000} minutes of this time. Pick a different runway or time.`,
      }
    }
  }
  return { ok: true }
}

/** Can this runway be closed / put into maintenance right now? */
export function validateRunwayClose(runwayId, allFlights, runways) {
  const runway = runways.find((r) => r.id === runwayId)
  if (!runway) return { ok: false, reason: 'That runway no longer exists.' }
  const occupying = allFlights.find(
    (f) =>
      (f.arrival_runway_id === runwayId || f.departure_runway_id === runwayId) &&
      ACTIVE_STATUSES.includes(f.status)
  )
  if (occupying) {
    return {
      ok: false,
      reason: `Can't close ${runway.name} — ${occupying.flight_number} still has a slot on it. Reassign or advance that flight first.`,
    }
  }
  return { ok: true }
}

/** Can this crew be taken off duty right now? Blocks it if they have an open turnaround task. */
export function validateCrewOffDuty(crewId, crewAssignments, crews) {
  const crew = crews.find((c) => c.id === crewId)
  if (!crew) return { ok: false, reason: 'That crew no longer exists.' }
  const openTask = crewAssignments.find((a) => a.crew_id === crewId && a.status !== 'done')
  if (openTask) {
    return {
      ok: false,
      reason: `Can't take ${crew.name} off duty — they still have an unfinished ${openTask.task_type} task.`,
    }
  }
  return { ok: true }
}

/**
 * Given a flight that just gained `delayMinutes` of new delay, compute the
 * cascade: which other flights sharing its gate/runway should shift too.
 * Returns a list of { flightId, addedDelayMinutes, cause } effects, and does
 * NOT write to the DB — the caller applies them and logs delay_events.
 */
export function computeCascade(flights, originFlight, delayMinutes) {
  if (delayMinutes <= 0) return []
  const effects = []
  const visited = new Set([originFlight.id])
  let frontier = [{ flight: originFlight, delay: delayMinutes }]

  while (frontier.length) {
    const next = []
    for (const { flight, delay } of frontier) {
      // Same gate, next flight to use it
      if (flight.gate_id) {
        const sharing = flights
          .filter((f) => f.gate_id === flight.gate_id && f.id !== flight.id && !visited.has(f.id))
          .filter((f) => {
            const theirIn = toMs(f.estimated_arrival || f.scheduled_arrival)
            const myOut = toMs(flight.estimated_departure || flight.scheduled_departure)
            return theirIn != null && myOut != null && theirIn >= myOut - MIN_TURNAROUND_MS
          })
          .sort((a, b) => (toMs(a.scheduled_arrival) || 0) - (toMs(b.scheduled_arrival) || 0))
        const nextInGate = sharing[0]
        if (nextInGate) {
          const propagated = Math.min(delay, delay) // same magnitude unless buffer absorbs it
          effects.push({ flightId: nextInGate.id, addedDelayMinutes: propagated, cause: `Gate held by ${flight.flight_number}`, causedBy: flight.id })
          visited.add(nextInGate.id)
          next.push({ flight: nextInGate, delay: propagated })
        }
      }
      // Same departure runway slot
      if (flight.departure_runway_id) {
        const sharing = flights
          .filter((f) => f.departure_runway_id === flight.departure_runway_id && f.id !== flight.id && !visited.has(f.id))
          .filter((f) => {
            const theirDep = toMs(f.estimated_departure || f.scheduled_departure)
            const myDep = toMs(flight.estimated_departure || flight.scheduled_departure)
            return theirDep != null && myDep != null && theirDep >= myDep
          })
          .sort((a, b) => (toMs(a.scheduled_departure) || 0) - (toMs(b.scheduled_departure) || 0))
        const nextOnRunway = sharing[0]
        if (nextOnRunway) {
          const propagated = Math.round(delay * 0.6) // runway queue absorbs some delay
          if (propagated > 0) {
            effects.push({ flightId: nextOnRunway.id, addedDelayMinutes: propagated, cause: `Runway queue behind ${flight.flight_number}`, causedBy: flight.id })
            visited.add(nextOnRunway.id)
            next.push({ flight: nextOnRunway, delay: propagated })
          }
        }
      }
    }
    frontier = next
  }
  return effects
}

/** KPI roll-up for the dashboard. */
export function computeKpis(flights, gates) {
  const total = flights.length
  const delayed = flights.filter((f) => f.delay_minutes > 0).length
  const onTime = total - delayed
  const avgDelay = total ? Math.round(flights.reduce((s, f) => s + f.delay_minutes, 0) / total) : 0
  const cancelled = flights.filter((f) => f.status === 'cancelled').length
  const gatesOccupied = gates.filter((g) => g.status === 'occupied').length
  const gateUtilization = gates.length ? Math.round((gatesOccupied / gates.length) * 100) : 0
  return {
    total,
    onTimePct: total ? Math.round((onTime / total) * 100) : 100,
    avgDelay,
    cancelled,
    gateUtilization,
    delayed,
  }
}

export const STATUS_FLOW = ['scheduled', 'approaching', 'landed', 'at_gate', 'turnaround', 'boarding', 'departed']

export function nextStatus(status) {
  const i = STATUS_FLOW.indexOf(status)
  if (i === -1 || i === STATUS_FLOW.length - 1) return status
  return STATUS_FLOW[i + 1]
}