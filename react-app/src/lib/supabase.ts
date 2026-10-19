import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

let client: SupabaseClient | null = null

export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey)

export function getSupabaseClient() {
  if (!isSupabaseConfigured) throw new Error('Configure the Supabase URL and publishable key in .env.local.')
  if (!supabaseUrl || !supabasePublishableKey) throw new Error('Configure the Supabase URL and publishable key in .env.local.')
  client ??= createClient(supabaseUrl, supabasePublishableKey)
  return client
}
