import { useMemo, useState } from 'react'
import { useLiveTable } from '../lib/useLiveData'
import { supabase } from '../lib/supabase'
import { useEffect } from 'react'
import { Card, DelayBadge, Empty, Spinner, fmtDateTime } from '../components/ui'

export default function DelayTrace() {
  const { rows: flights, loading } = useLiveTable('flights', 'scheduled_departure')
  const [selectedId, setSelectedId] = useState(null)
  const [events, setEvents] = useState([])
  const [eventsLoading, setEventsLoading] = useState(false)

  const delayed = useMemo(() => flights.filter((f) => f.delay_minutes > 0), [flights])
  const selected = flights.find((f) => f.id === selectedId) || delayed[0] || null

  useEffect(() => {
    if (!selected) return
    setEventsLoading(true)
    supabase
      .from('delay_events')
      .select('*, caused_by:caused_by_flight_id(flight_number)')
      .eq('flight_id', selected.id)
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        setEvents(data || [])
        setEventsLoading(false)
      })
  }, [selected?.id])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner />
      </div>
    )
  }

  return (
    <div className="flex flex-col md:flex-row gap-4">
      <Card className="p-0 overflow-hidden md:w-72 shrink-0">
        <div className="px-4 py-3 border-b border-line text-sm font-semibold text-ink-dim">Delayed flights</div>
        <div className="divide-y divide-line/60 max-h-[70vh] overflow-y-auto">
          {delayed.map((f) => (
            <button
              key={f.id}
              onClick={() => setSelectedId(f.id)}
              className={`w-full text-left px-4 py-2.5 flex items-center justify-between hover:bg-bg-raised/50 ${
                selected?.id === f.id ? 'bg-brand-500/10 border-l-2 border-brand-400' : ''
              }`}
            >
              <span className="font-mono font-semibold text-sm text-ink">{f.flight_number}</span>
              <DelayBadge minutes={f.delay_minutes} />
            </button>
          ))}
          {delayed.length === 0 && <Empty>No delays right now — everything's on time.</Empty>}
        </div>
      </Card>

      <Card className="p-5 flex-1">
        {!selected ? (
          <Empty>Select a flight to see why it was delayed.</Empty>
        ) : (
          <>
            <div className="flex items-center justify-between mb-5">
              <div>
                <div className="font-mono font-bold text-xl text-brand-200">{selected.flight_number}</div>
                <div className="text-ink-faint text-sm">{selected.origin} → {selected.destination}</div>
              </div>
              <DelayBadge minutes={selected.delay_minutes} />
            </div>

            {eventsLoading ? (
              <Spinner />
            ) : events.length === 0 ? (
              <Empty>No recorded cause — delay may have been set manually.</Empty>
            ) : (
              <div className="relative pl-5">
                <div className="absolute left-[7px] top-1.5 bottom-1.5 w-px bg-line" />
                <div className="flex flex-col gap-5">
                  {events.map((ev) => (
                    <div key={ev.id} className="relative">
                      <div className="absolute -left-5 top-1 w-3 h-3 rounded-full bg-warn border-2 border-bg-card" />
                      <div className="text-sm text-ink font-medium">{ev.cause}</div>
                      <div className="text-xs text-ink-faint mt-0.5">
                        +{ev.delay_minutes}m · {fmtDateTime(ev.created_at)}
                        {ev.caused_by?.flight_number && <> · chained from <span className="font-mono text-ink-dim">{ev.caused_by.flight_number}</span></>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  )
}
