import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { AuthScreen } from './components/AuthScreen.tsx'
import { GroupScreen } from './components/GroupScreen.tsx'
import { GroupsScreen } from './components/GroupsScreen.tsx'
import { isConfigured, supabase } from './lib/supabase.ts'
import type { Group } from './lib/types.ts'

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(!isConfigured)
  const [group, setGroup] = useState<Group | null>(null)

  useEffect(() => {
    if (!supabase) {
      return
    }
    let cancelled = false
    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) {
        setSession(data.session)
        setReady(true)
      }
    })
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      if (!nextSession) {
        setGroup(null)
      }
    })
    return () => {
      cancelled = true
      data.subscription.unsubscribe()
    }
  }, [])

  if (!isConfigured) {
    return (
      <main className="auth-card">
        <h1>Group Expense Splitter</h1>
        <p className="error">
          This build is missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY.
        </p>
      </main>
    )
  }

  if (!ready) {
    return (
      <main className="auth-card">
        <p className="muted">Loading…</p>
      </main>
    )
  }

  if (!session) {
    return <AuthScreen />
  }

  const email = session.user.email ?? session.user.id

  async function signOut() {
    await supabase?.auth.signOut()
    setGroup(null)
  }

  if (group) {
    return (
      <GroupScreen
        group={group}
        email={email}
        onBack={() => setGroup(null)}
        onSignOut={() => {
          void signOut()
        }}
        onDeleted={() => setGroup(null)}
      />
    )
  }

  return (
    <GroupsScreen
      email={email}
      onOpenGroup={setGroup}
      onSignOut={() => {
        void signOut()
      }}
    />
  )
}
