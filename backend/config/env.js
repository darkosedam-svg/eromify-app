/**
 * Required configuration, read once and never defaulted.
 *
 * Every Supabase client in the backend used to fall back to a hardcoded
 * project URL and anon key when the variable was missing. That silently
 * pointed a misconfigured deployment at someone else's database. A missing
 * variable now fails at startup with its name.
 */
const requireEnv = (name) => {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value.trim();
};

const supabaseUrl = () => requireEnv('SUPABASE_URL');
const supabaseAnonKey = () => requireEnv('SUPABASE_ANON_KEY');
// The service-role key is required for server-side writes (webhook,
// payments). Falling back to the anon key made those writes fail under RLS
// without any error at startup.
const supabaseServiceKey = () => requireEnv('SUPABASE_SERVICE_ROLE_KEY');

module.exports = { requireEnv, supabaseUrl, supabaseAnonKey, supabaseServiceKey };
