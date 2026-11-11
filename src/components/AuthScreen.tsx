import { useState, type FormEvent } from 'react'
import { requireSupabase } from '../lib/supabase.ts'

type Mode = 'signin' | 'signup'

function errorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message: unknown }).message
    if (typeof message === 'string' && message.trim()) {
      return message
    }
  }
  return fallback
}

export function AuthScreen() {
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setBusy(true)
    const client = requireSupabase()
    try {
      if (mode === 'signup') {
        const { data, error: signUpError } = await client.auth.signUp({
          email: email.trim(),
          password,
        })
        if (signUpError) {
          throw signUpError
        }
        if (!data.session) {
          const { error: signInError } = await client.auth.signInWithPassword({
            email: email.trim(),
            password,
          })
          if (signInError) {
            throw new Error(
              'The account was created, but you still need to confirm the email before signing in.',
            )
          }
        }
      } else {
        const { error: signInError } = await client.auth.signInWithPassword({
          email: email.trim(),
          password,
        })
        if (signInError) {
          throw signInError
        }
      }
    } catch (caught) {
      setError(errorMessage(caught, 'Something went wrong. Please try again.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="auth-card">
      <h1>Group Expense Splitter</h1>
      <p className="lede">
        Create a group, add expenses, and see who should pay whom.
      </p>
      <div className="tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'signin'}
          className={mode === 'signin' ? 'active' : ''}
          onClick={() => {
            setMode('signin')
            setError(null)
          }}
        >
          Sign in
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'signup'}
          className={mode === 'signup' ? 'active' : ''}
          onClick={() => {
            setMode('signup')
            setError(null)
          }}
        >
          Create account
        </button>
      </div>
      <form onSubmit={onSubmit}>
        <label>
          Email
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label>
          Password
          <input
            type="password"
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            required
            minLength={6}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {error ? <p className="error">{error}</p> : null}
        <button type="submit" className="primary" disabled={busy}>
          {busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Sign in'}
        </button>
      </form>
    </main>
  )
}
