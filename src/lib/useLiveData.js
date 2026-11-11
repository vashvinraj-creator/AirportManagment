import { useEffect, useState, useCallback } from 'react'
import { supabase, AIRPORT_ID } from './supabase'

/**
 * Subscribes to a table with realtime updates. By default scopes to the sim
 * airport (pass `scoped: false` for join/lookup tables that have no
 * `airport_id` column, like `crew_assignments`).
 */
export function useLiveTable(table, orderBy, { scoped = true } = {}) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const reload = useCallback(async () => {
    let q = supabase.from(table).select('*')
    if (scoped) q = q.eq('airport_id', AIRPORT_ID)
    if (orderBy) q = q.order(orderBy, { ascending: true })
    const { data, error } = await q
    if (error) setError(error)
    else {
      setError(null)
      setRows(data || [])
    }
    setLoading(false)
  }, [table, orderBy, scoped])

  useEffect(() => {
    reload()
    const channel = supabase
      .channel(`${table}-changes`)
      .on('postgres_changes', { event: '*', schema: 'public', table }, () => {
        reload()
      })
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [table, reload])

  return { rows, loading, error, reload }
}

export function useSimulationState() {
  const [state, setState] = useState(null)
  const reload = useCallback(async () => {
    const { data } = await supabase.from('simulation_state').select('*').eq('id', 1).single()
    setState(data)
  }, [])

  useEffect(() => {
    reload()
    const channel = supabase
      .channel('sim-state-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'simulation_state' }, () => reload())
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [reload])

  return { state, reload }
}
