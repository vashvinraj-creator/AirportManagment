export function Card({ className = '', children, ...props }) {
  return (
    <div
      className={`bg-bg-card border border-line rounded-xl shadow-[0_1px_0_rgba(255,255,255,0.02)_inset] ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}

export function Button({ variant = 'primary', className = '', children, ...props }) {
  const base = 'inline-flex items-center justify-center gap-1.5 rounded-lg text-sm font-semibold px-3.5 py-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed'
  const styles = {
    primary: 'bg-brand-500 text-bg hover:bg-brand-400 shadow-glow',
    secondary: 'bg-bg-raised border border-line text-ink hover:border-brand-700 hover:text-brand-200',
    ghost: 'text-ink-dim hover:text-ink hover:bg-bg-raised',
    danger: 'bg-danger/15 border border-danger/40 text-danger hover:bg-danger/25',
  }
  return (
    <button className={`${base} ${styles[variant]} ${className}`} {...props}>
      {children}
    </button>
  )
}

const STATUS_STYLES = {
  scheduled: 'bg-ink-faint/15 text-ink-dim border-line',
  approaching: 'bg-warn/15 text-warn border-warn/30',
  landed: 'bg-brand-500/15 text-brand-300 border-brand-700/50',
  at_gate: 'bg-brand-500/20 text-brand-200 border-brand-600/50',
  turnaround: 'bg-vip/15 text-vip border-vip/30',
  boarding: 'bg-brand-400/20 text-brand-100 border-brand-500/50',
  departed: 'bg-ink-faint/10 text-ink-faint border-line',
  cancelled: 'bg-danger/15 text-danger border-danger/30',
}

export function StatusBadge({ status }) {
  const style = STATUS_STYLES[status] || STATUS_STYLES.scheduled
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wide border ${style}`}>
      {status.replace('_', ' ')}
    </span>
  )
}

export function PriorityBadge({ priority }) {
  if (priority === 'normal') return null
  const style = priority === 'vip' ? 'bg-vip/15 text-vip border-vip/30' : 'bg-danger/15 text-danger border-danger/30'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wide border ${style}`}>
      {priority}
    </span>
  )
}

export function DelayBadge({ minutes }) {
  if (!minutes || minutes <= 0) {
    return <span className="text-brand-300 text-xs font-semibold">On time</span>
  }
  const color = minutes >= 45 ? 'text-danger' : minutes >= 15 ? 'text-warn' : 'text-brand-200'
  return <span className={`text-xs font-semibold ${color}`}>+{minutes}m</span>
}

export function RoleBadge({ role }) {
  const labels = { admin: 'Admin', ground_staff: 'Ground Staff', viewer: 'Viewer' }
  const styles = {
    admin: 'bg-brand-500/20 text-brand-200 border-brand-600/50',
    ground_staff: 'bg-vip/15 text-vip border-vip/30',
    viewer: 'bg-ink-faint/15 text-ink-dim border-line',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${styles[role] || styles.viewer}`}>
      {labels[role] || role}
    </span>
  )
}

export function Spinner({ className = '' }) {
  return (
    <div className={`inline-block w-4 h-4 border-2 border-brand-500/30 border-t-brand-400 rounded-full animate-spin ${className}`} />
  )
}

export function Empty({ children }) {
  return <div className="text-center py-10 text-ink-faint text-sm">{children}</div>
}

export function fmtTime(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function fmtDateTime(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}
