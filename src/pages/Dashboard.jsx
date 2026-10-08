import { useMemo } from 'react'
import { useLiveTable, useSimulationState } from '../lib/useLiveData'
import { computeKpis, detectAllConflicts } from '../lib/scheduler'
import { Card, Spinner, StatusBadge, PriorityBadge, DelayBadge, fmtTime } from '../components/ui'
import { useAuth } from '../lib/AuthContext'
import SimClock from '../components/SimClock'

function Kpi({ label, value, sub, tone = 'brand' }) {
  const toneClass = { brand: 'text-brand-300', warn: 'text-warn', danger: 'text-danger', ink: 'text-ink' }[tone]
  return (
    <Card className="p-4 flex-1 min-w-[140px]">
      <div className="text-ink-faint text-xs font-medium uppercase tracking-wide mb-1">{label}</div>
      <div className={`text-2xl font-extrabold ${toneClass}`}>{value}</div>
      {sub && <div className="text-ink-faint text-xs mt-0.5">{sub}</div>}
    </Card>
  )
}

export default function Dashboard() {
  const { rows: flights, loading: fLoading } = useLiveTable('flights', 'scheduled_departure')
  const { rows: gates, loading: gLoading } = useLiveTable('gates', 'name')
  const { state: simState } = useSimulationState()
  const { isStaff } = useAuth()

  const kpis = useMemo(() => computeKpis(flights, gates), [flights, gates])
  const conflicts = useMemo(() => detectAllConflicts(flights), [flights])
  const active = useMemo(
    () => flights.filter((f) => !['departed', 'cancelled'].includes(f.status)).slice(0, 8),
    [flights]
  )

  if (fLoading || gLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col lg:flex-row gap-5">
        <div className="flex-1 flex flex-wrap gap-4">
          <Kpi label="On-time %" value={`${kpis.onTimePct}%`} tone={kpis.onTimePct >= 80 ? 'brand' : kpis.onTimePct >= 60 ? 'warn' : 'danger'} />
          <Kpi label="Avg delay" value={`${kpis.avgDelay}m`} tone={kpis.avgDelay <= 10 ? 'brand' : kpis.avgDelay <= 30 ? 'warn' : 'danger'} />
          <Kpi label="Flights tracked" value={kpis.total} sub={`${kpis.delayed} delayed`} tone="ink" />
          <Kpi label="Gate utilization" value={`${kpis.gateUtilization}%`} tone="ink" />
          <Kpi label="Active conflicts" value={conflicts.length} tone={conflicts.length ? 'danger' : 'brand'} />
        </div>
        {isStaff && <SimClock simState={simState} />}
      </div>

      {conflicts.length > 0 && (
        <Card className="p-4 border-danger/30">
          <div className="text-danger font-semibold text-sm mb-2 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-danger pulse-dot" /> {conflicts.length} scheduling conflict{conflicts.length > 1 ? 's' : ''} detected
          </div>
          <div className="flex flex-col gap-1.5">
            {conflicts.slice(0, 5).map((c, i) => (
              <div key={i} className="text-xs text-ink-dim">
                <span className="uppercase font-semibold text-ink-faint">{c.type}</span>{' '}
                <span className="font-mono text-ink">{c.flightA.flight_number}</span> and{' '}
                <span className="font-mono text-ink">{c.flightB.flight_number}</span> overlap by ~{c.overlapMinutes}m
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-line text-sm font-semibold text-ink-dim">Active flights</div>
        <div className="divide-y divide-line">
          {active.length === 0 && <div className="px-4 py-6 text-sm text-ink-faint">No active flights right now.</div>}
          {active.map((f) => (
            <div key={f.id} className="px-4 py-3 flex items-center gap-3 flex-wrap hover:bg-bg-raised/50 transition-colors">
              <span className="font-mono font-bold text-brand-200 w-16">{f.flight_number}</span>
              <span className="text-ink-dim text-sm flex-1 min-w-[100px]">{f.origin} → {f.destination}</span>
              <StatusBadge status={f.status} />
              <PriorityBadge priority={f.priority} />
              <span className="text-ink-faint text-xs w-16 text-right">{fmtTime(f.scheduled_departure || f.scheduled_arrival)}</span>
              <DelayBadge minutes={f.delay_minutes} />
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
