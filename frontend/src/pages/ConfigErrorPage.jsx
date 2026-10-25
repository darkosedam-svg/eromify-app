// Shown instead of the app when required build-time configuration is missing.
// Rendered without the router or auth providers, because those need the very
// configuration that is missing.
function ConfigErrorPage({ missing }) {
  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center px-4">
      <div className="max-w-lg w-full bg-gray-950 border border-gray-800 rounded-2xl p-8">
        <h1 className="text-2xl font-semibold mb-3">Eromify is not configured</h1>
        <p className="text-gray-400 mb-4">
          The app cannot start because these settings are missing:
        </p>
        <ul className="mb-6 space-y-1">
          {missing.map((name) => (
            <li key={name}>
              <code className="text-pink-400">{name}</code>
            </li>
          ))}
        </ul>
        <p className="text-gray-400 text-sm">
          Copy <code>frontend/env.example</code> to <code>frontend/.env</code>, fill in your
          Supabase project URL and anon key, then restart the dev server. On a hosting
          provider, set them as build environment variables and redeploy.
        </p>
      </div>
    </div>
  )
}

export default ConfigErrorPage
