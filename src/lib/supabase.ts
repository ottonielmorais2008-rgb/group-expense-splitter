import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isConfigured = Boolean(url && key)

export const supabase: SupabaseClient | null = isConfigured
  ? createClient(url, key)
  : null

export function requireSupabase(): SupabaseClient {
  if (!supabase) {
    throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY')
  }
  return supabase
}
