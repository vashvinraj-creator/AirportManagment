import { useMemo, useState } from 'react'
import { useLiveTable } from '../lib/useLiveData'
import { Card, Spinner, fmtTime } from '../components/ui'

const HOURS_SPAN = 8 // visible window
const PX_PER_MIN = 3.2

function clampToTrack(startMs, endMs, windowStartMs, windowEndMs) {
  const s = Math.max(startMs, windowStartMs)
  const e = Math.min(endMs, windowEndMs)
  return { left: ((s - windowStartMs) / 60000) * PX_PER_MIN, width: Math.max(((e - s) / 60000) * PX_PER_MIN, 8) }
}

const STATUS_COLORS = {
  scheduled: 'bg-ink-faint/30 border-ink-faint/50',
  approaching: 'bg-warn/30 border-warn/60',
  landed: 'bg-brand-600/40 border-brand-500',
  at_gate: 'bg-brand-500/50 border-brand-400',
  turnaround: 'bg-vip/40 border-vip/70',
  boarding: 'bg-brand-400/50 border-brand-300',
  departed: 'bg-ink-faint/15 border-ink-faint/30',
  cancelled: 'bg-danger/30 border-danger/60',
}

export default function FlightBoard() {
  const { rows: flights, loading: fLoading } = useLiveTable('flights', 'scheduled_departure')
  const { rows: gates, loading: gLoading } = useLiveTable('gates', 'name')
  const [selected, setSelected] = useState(null)

  const windowStart = useMemo(() => {
    const d = new Date()
    d.setMinutes(0, 0, 0)
    d.setHours(d.getHours() - 1)
    return d.getTime()
  }, [])
  const windowEnd = windowStart + HOURS_SPAN * 60 * 60 * 1000
  const totalWidth = HOURS_SPAN * 60 * PX_PER_MIN

  const hourMarks = useMemo(() => {
    const marks = []
    for (let i = 0; i <= HOURS_SPAN; i++) {
      const t = windowStart + i * 60 * 60 * 1000
      marks.push({ left: i * 60 * PX_PER_MIN, label: new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) })
    }
    return marks
  }, [windowStart])

  const nowOffset = ((Date.now() - windowStart) / 60000) * PX_PER_MIN

  const byGate = useMemo(() => {
    const map = {}
    for (const g of gates) map[g.id] = []
    for (const f of flights) {
      if (!f.gate_id) continue
      const arr = f.estimated_arrival || f.scheduled_arrival
      const dep = f.estimated_departure || f.scheduled_departure
      if (!arr && !dep) continue
      const startMs = arr ? new Date(arr).getTime() : new Date(dep).getTime() - 30 * 60000
      const endMs = dep ? new Date(dep).getTime() : startMs + 60 * 60000
      if (endMs < windowStart || startMs > windowEnd) continue
      map[f.gate_id] = map[f.gate_id] || []
      map[f.gate_id].push({ flight: f, startMs, endMs })
    }
    return map
  }, [flights, gates, windowStart, windowEnd])

  const unassigned = flights.filter((f) => !f.gate_id && !['departed', 'cancelled'].includes(f.status))

  if (fLoading || gLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-line flex items-center justify-between">
          <span className="text-sm font-semibold text-ink-dim">Gate timeline</span>
          <span className="text-xs text-ink-faint">Scroll horizontally to see the full window</span>
        </div>
        <div className="overflow-x-auto">
          <div style={{ width: totalWidth + 140 }}>
            {/* Hour ruler */}
            <div className="flex sticky top-0 bg-bg-card z-10 border-b border-line" style={{ paddingLeft: 140 }}>
              <div className="relative h-7" style={{ width: totalWidth }}>
                {hourMarks.map((m, i) => (
                  <div key={i} className="absolute top-0 h-full border-l border-line text-[10px] text-ink-faint pl-1 pt-1" style={{ left: m.left }}>
                    {m.label}
                  </div>
                ))}
                <div className="absolute top-0 h-full border-l border-brand-400 z-20" style={{ left: nowOffset }}>
                  <div className="w-1.5 h-1.5 rounded-full bg-brand-400 -ml-[3px] mt-0.5" />
                </div>
              </div>
            </div>
            {/* Gate rows */}
            {gates.map((g) => (
              <div key={g.id} className="flex border-b border-line last:border-b-0">
                <div className="w-[140px] shrink-0 px-3 py-3 text-sm font-mono font-semibold text-ink-dim border-r border-line flex items-center justify-between">
                  {g.name}
                  <span className={`w-1.5 h-1.5 rounded-full ${g.status === 'occupied' ? 'bg-warn' : g.status === 'closed' ? 'bg-danger' : 'bg-brand-400'}`} />
                </div>
                <div className="relative" style={{ width: totalWidth, height: 46 }}>
                  <div className="absolute inset-0 border-l border-brand-400/40" style={{ left: nowOffset }} />
                  {(byGate[g.id] || []).map(({ flight, startMs, endMs }) => {
                    const { left, width } = clampToTrack(startMs, endMs, windowStart, windowEnd)
                    return (
                      <button
                        key={flight.id}
                        onClick={() => setSelected(flight)}
                        className={`absolute top-1.5 h-8 rounded-md border px-2 flex items-center text-[11px] font-mono font-bold text-ink overflow-hidden whitespace-nowrap hover:brightness-125 transition-all ${STATUS_COLORS[flight.status]}`}
                        style={{ left, width }}
                        title={`${flight.flight_number} · ${flight.status}`}
                      >
                        {flight.flight_number}
                        {flight.delay_minutes > 0 && <span className="ml-1 text-warn">+{flight.delay_minutes}m</span>}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {unassigned.length > 0 && (
        <Card className="p-4">
          <div className="text-sm font-semibold text-ink-dim mb-2">Unassigned flights ({unassigned.length})</div>
          <div className="flex flex-wrap gap-2">
            {unassigned.map((f) => (
              <button
                key={f.id}
                onClick={() => setSelected(f)}
                className="px-2.5 py-1 rounded-md border border-line bg-bg-raised text-xs font-mono text-ink-dim hover:border-brand-600 hover:text-brand-200"
              >
                {f.flight_number}
              </button>
            ))}
          </div>
        </Card>
      )}

      {selected && <FlightDetailDrawer flight={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}

function FlightDetailDrawer({ flight, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={onClose}>
      <div className="w-full max-w-sm bg-bg-panel border-l border-line p-5 h-full overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <span className="font-mono font-bold text-xl text-brand-200">{flight.flight_number}</span>
          <button onClick={onClose} className="text-ink-faint hover:text-ink text-lg leading-none">✕</button>
        </div>
        <div className="flex flex-col gap-2 text-sm">
          <Row label="Airline" value={flight.airline} />
          <Row label="Route" value={`${flight.origin} → ${flight.destination}`} />
          <Row label="Status" value={flight.status.replace('_', ' ')} />
          <Row label="Priority" value={flight.priority} />
          <Row label="Scheduled arrival" value={fmtTime(flight.scheduled_arrival)} />
          <Row label="Scheduled departure" value={fmtTime(flight.scheduled_departure)} />
          <Row label="Delay" value={`${flight.delay_minutes} min`} />
        </div>
      </div>
    </div>
  )
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between py-1.5 border-b border-line/60">
      <span className="text-ink-faint">{label}</span>
      <span className="text-ink font-medium">{value || '—'}</span>
    </div>
  )
}
