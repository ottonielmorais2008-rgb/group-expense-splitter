import { useEffect, useState, type FormEvent } from 'react'
import { requireSupabase } from '../lib/supabase.ts'
import type { Group } from '../lib/types.ts'

type Props = {
  email: string
  onOpenGroup: (group: Group) => void
  onSignOut: () => void
}

function errorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message: unknown }).message
    if (typeof message === 'string' && message.trim()) {
      return message
    }
  }
  return fallback
}

export function GroupsScreen({ email, onOpenGroup, onSignOut }: Props) {
  const [groups, setGroups] = useState<Group[]>([])
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function loadGroups() {
    const { data, error: loadError } = await requireSupabase()
      .from('groups')
      .select('id, name, created_at')
      .order('created_at', { ascending: false })
    if (loadError) {
      throw loadError
    }
    setGroups((data ?? []) as Group[])
  }

  useEffect(() => {
    let cancelled = false
    loadGroups().catch((caught) => {
      if (!cancelled) {
        setError(errorMessage(caught, 'Could not load groups.'))
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  async function onCreate(event: FormEvent) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      return
    }
    setBusy(true)
    setError(null)
    try {
      const { data: userData, error: userError } = await requireSupabase().auth.getUser()
      if (userError) {
        throw userError
      }
      const userId = userData.user?.id
      if (!userId) {
        throw new Error('You need to be signed in to create a group.')
      }
      const { data, error: insertError } = await requireSupabase()
        .from('groups')
        .insert({ name: trimmed, created_by: userId })
        .select('id, name, created_at')
        .single()
      if (insertError) {
        throw insertError
      }
      setName('')
      setGroups((current) => [data as Group, ...current])
    } catch (caught) {
      setError(errorMessage(caught, 'Could not create the group.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="page">
      <header className="topbar">
        <div>
          <p className="eyebrow">Signed in as {email}</p>
          <h1>Your groups</h1>
        </div>
        <button type="button" onClick={onSignOut}>
          Sign out
        </button>
      </header>

      <form className="row-form" onSubmit={onCreate}>
        <label>
          New group name
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={80}
            required
            placeholder="Weekend trip"
          />
        </label>
        <button type="submit" className="primary" disabled={busy}>
          Create group
        </button>
      </form>
      {error ? <p className="error">{error}</p> : null}

      {groups.length === 0 ? (
        <p className="muted">No groups yet. Create one to start splitting expenses.</p>
      ) : (
        <ul className="list">
          {groups.map((group) => (
            <li key={group.id}>
              <button type="button" className="list-button" onClick={() => onOpenGroup(group)}>
                {group.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
