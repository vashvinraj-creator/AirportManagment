import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { Button, Card, Spinner } from '../components/ui'
import { useToast } from '../lib/ToastContext'

export default function Login() {
  const [mode, setMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [busy, setBusy] = useState(false)
  const toast = useToast()

  async function handleSubmit(e) {
    e.preventDefault()
    if (!email || !password) {
      toast.error('Email and password are required.')
      return
    }
    setBusy(true)
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        toast.success('Signed in.')
      } else {
        if (password.length < 6) throw new Error('Password must be at least 6 characters.')
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName || email } },
        })
        if (error) throw error
        toast.success('Account created. New accounts start as Viewer — ask an admin to upgrade your role.')
      }
    } catch (err) {
      toast.error(err.message || 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 scanline">
      <Card className="w-full max-w-sm p-7">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-8 h-8 rounded-lg bg-brand-500 text-bg flex items-center justify-center font-extrabold text-sm shadow-glow">✈</div>
          <span className="font-bold text-lg tracking-tight">Simport Ops</span>
        </div>
        <p className="text-ink-faint text-sm mb-6">Airport operations simulator</p>

        <div className="flex gap-1 mb-5 bg-bg-raised rounded-lg p-1 border border-line">
          <button
            onClick={() => setMode('signin')}
            className={`flex-1 py-1.5 rounded-md text-sm font-semibold transition-colors ${mode === 'signin' ? 'bg-brand-500 text-bg' : 'text-ink-dim hover:text-ink'}`}
          >
            Sign in
          </button>
          <button
            onClick={() => setMode('signup')}
            className={`flex-1 py-1.5 rounded-md text-sm font-semibold transition-colors ${mode === 'signup' ? 'bg-brand-500 text-bg' : 'text-ink-dim hover:text-ink'}`}
          >
            Sign up
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {mode === 'signup' && (
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Full name"
              className="bg-bg-raised border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-600"
            />
          )}
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            autoComplete="email"
            className="bg-bg-raised border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-600"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            className="bg-bg-raised border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-600"
          />
          <Button type="submit" disabled={busy} className="mt-1 w-full">
            {busy ? <Spinner /> : mode === 'signin' ? 'Sign in' : 'Create account'}
          </Button>
        </form>

        <p className="text-ink-faint text-xs mt-5 leading-relaxed">
          New accounts start as <span className="text-ink-dim font-medium">Viewer</span>. An admin can
          promote you to Ground Staff or Admin from the Team panel.
        </p>
      </Card>
    </div>
  )
}
