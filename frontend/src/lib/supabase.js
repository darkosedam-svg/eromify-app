import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// The variables the app cannot start without. createClient throws on a
// missing URL, and because this module loads before anything renders, that
// throw used to leave a blank white page with the reason only in the browser
// console. main.jsx reads this list and shows it on screen instead.
export const missingConfig = [
  !supabaseUrl && 'VITE_SUPABASE_URL',
  !supabaseKey && 'VITE_SUPABASE_ANON_KEY',
].filter(Boolean)

// One shared client for the whole app; null only when configuration is
// missing, in which case main.jsx never renders anything that uses it.
export const supabase = missingConfig.length ? null : createClient(supabaseUrl, supabaseKey)
