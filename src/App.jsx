import { useState } from 'react'
import { useAuth } from './lib/AuthContext'
import { Spinner, RoleBadge } from './components/ui'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import FlightBoard from './pages/FlightBoard'
import Flights from './pages/Flights'
import Resources from './pages/Resources'
import DelayTrace from './pages/DelayTrace'
import Team from './pages/Team'

const TABS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'board', label: 'Gate Board' },
  { key: 'flights', label: 'Flights' },
  { key: 'resources', label: 'Resources' },
  { key: 'delays', label: 'Delay Trace' },
  { key: 'team', label: 'Team' },
]

export default function App() {
  const { session, loading, profile, signOut } = useAuth()
  const [tab, setTab] = useState('dashboard')

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner />
      </div>
    )
  }

  if (!session) {
    return <Login />
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-line bg-bg-panel/80 backdrop-blur sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 flex items-center gap-4 h-14">
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-7 h-7 rounded-md bg-brand-500 text-bg flex items-center justify-center font-extrabold text-xs shadow-glow">✈</div>
            <span className="font-bold tracking-tight hidden sm:block">Simport Ops</span>
          </div>
          <nav className="flex gap-1 overflow-x-auto flex-1">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors ${
                  tab === t.key ? 'bg-brand-500/15 text-brand-200 border border-brand-700/50' : 'text-ink-dim hover:text-ink hover:bg-bg-raised'
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>
          <div className="flex items-center gap-2 shrink-0">
            {profile && <RoleBadge role={profile.role} />}
            <button onClick={signOut} className="text-ink-faint hover:text-ink text-sm">
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-5">
        {tab === 'dashboard' && <Dashboard />}
        {tab === 'board' && <FlightBoard />}
        {tab === 'flights' && <Flights />}
        {tab === 'resources' && <Resources />}
        {tab === 'delays' && <DelayTrace />}
        {tab === 'team' && <Team />}
      </main>

      <footer className="text-center text-ink-faint text-xs py-4 border-t border-line">
        Simport Ops — airport operations simulator · signed in as {profile?.full_name || session.user.email}
      </footer>
    </div>
  )
}
