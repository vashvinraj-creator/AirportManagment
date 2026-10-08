import { useEffect, useRef, useState } from 'react'
import { supabase, AIRPORT_ID } from '../lib/supabase'
import { computeCascade } from '../lib/scheduler'
import { Button, Card } from './ui'
import { useToast } from '../lib/ToastContext'

const SPEEDS = [1, 5, 15, 60]
const RANDOM_EVENTS = [
  { cause: 'Fog reduced visibility', minutes: [10, 30] },
  { cause: 'Minor mechanical check', minutes: [15, 40] },
  { cause: 'Late inbound crew', minutes: [10, 25] },
  { cause: 'Air traffic control hold', minutes: [8, 20] },
]

export default function SimClock({ simState }) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const tickRef = useRef(null)

  useEffect(() => {
    if (!simState?.is_running) {
      if (tickRef.current) clearInterval(tickRef.current)
      return
    }
    tickRef.current = setInterval(async () => {
      await runTick(simState.speed_multiplier)
    }, 5000)
    return () => clearInterval(tickRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simState?.is_running, simState?.speed_multiplier])

  async function runTick(speed) {
    const newSimTime = new Date(Date.now())
    await supabase.from('simulation_state').update({ current_sim_time: newSimTime.toISOString(), updated_at: new Date().toISOString() }).eq('id', 1)

    // Small chance per tick of a random operational event hitting an active flight.
    if (Math.random() < 0.35) {
      const { data: flights } = await supabase
        .from('flights')
        .select('*')
        .eq('airport_id', AIRPORT_ID)
        .in('status', ['scheduled', 'approaching', 'turnaround', 'boarding'])
      if (flights && flights.length) {
        const target = flights[Math.floor(Math.random() * flights.length)]
        const ev = RANDOM_EVENTS[Math.floor(Math.random() * RANDOM_EVENTS.length)]
        const minutes = Math.round(ev.minutes[0] + Math.random() * (ev.minutes[1] - ev.minutes[0]))
        await applyDelay(flights, target, minutes, ev.cause, null)
      }
    }
  }

  async function applyDelay(allFlights, flight, minutes, cause, causedById) {
    const newDelay = (flight.delay_minutes || 0) + minutes
    await supabase
      .from('flights')
      .update({
        delay_minutes: newDelay,
        estimated_departure: flight.scheduled_departure
          ? new Date(new Date(flight.scheduled_departure).getTime() + newDelay * 60000).toISOString()
          : flight.estimated_departure,
        estimated_arrival: flight.scheduled_arrival
          ? new Date(new Date(flight.scheduled_arrival).getTime() + newDelay * 60000).toISOString()
          : flight.estimated_arrival,
        updated_at: new Date().toISOString(),
      })
      .eq('id', flight.id)

    await supabase.from('delay_events').insert({
      flight_id: flight.id,
      cause,
      delay_minutes: minutes,
      caused_by_flight_id: causedById,
    })

    const cascade = computeCascade(allFlights, { ...flight, delay_minutes: newDelay }, minutes)
    for (const effect of cascade) {
      const target = allFlights.find((f) => f.id === effect.flightId)
      if (!target) continue
      await applyDelay(allFlights, target, effect.addedDelayMinutes, effect.cause, effect.causedBy)
    }
  }

  async function toggleRunning() {
    setBusy(true)
    try {
      const { error } = await supabase
        .from('simulation_state')
        .update({ is_running: !simState?.is_running, updated_at: new Date().toISOString() })
        .eq('id', 1)
      if (error) throw error
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function setSpeed(mult) {
    const { error } = await supabase.from('simulation_state').update({ speed_multiplier: mult }).eq('id', 1)
    if (error) toast.error(error.message)
  }

  if (!simState) return null

  return (
    <Card className="p-4 flex flex-col gap-2 min-w-[220px]">
      <div className="text-ink-faint text-xs font-medium uppercase tracking-wide">Simulation clock</div>
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${simState.is_running ? 'bg-brand-400 pulse-dot' : 'bg-ink-faint'}`} />
        <span className="font-mono text-sm text-ink">
          {new Date(simState.current_sim_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </span>
      </div>
      <div className="flex gap-1.5 mt-1">
        <Button variant={simState.is_running ? 'danger' : 'primary'} className="flex-1" disabled={busy} onClick={toggleRunning}>
          {simState.is_running ? 'Pause' : 'Run'}
        </Button>
      </div>
      <div className="flex gap-1 mt-1">
        {SPEEDS.map((s) => (
          <button
            key={s}
            onClick={() => setSpeed(s)}
            className={`flex-1 text-xs py-1 rounded-md border transition-colors ${
              simState.speed_multiplier === s
                ? 'bg-brand-500/20 border-brand-600 text-brand-200'
                : 'border-line text-ink-faint hover:text-ink-dim'
            }`}
          >
            {s}x
          </button>
        ))}
      </div>
    </Card>
  )
}
