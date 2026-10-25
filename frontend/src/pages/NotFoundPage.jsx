import { Link, useLocation } from 'react-router-dom'

// Unknown URLs used to redirect silently to the home page, which hid broken
// links and mistyped addresses. Say so instead, and offer the way back.
function NotFoundPage() {
  const { pathname } = useLocation()
  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        <p className="text-6xl font-semibold mb-4 bg-gradient-to-r from-pink-400 to-purple-300 bg-clip-text text-transparent">
          404
        </p>
        <h1 className="text-2xl font-semibold mb-2">Page not found</h1>
        <p className="text-gray-400 mb-8 break-all">
          There is no page at <code>{pathname}</code>.
        </p>
        <Link
          to="/"
          className="inline-block px-6 py-3 rounded-xl bg-gradient-to-r from-pink-500 to-purple-500 font-medium"
        >
          Back to homepage
        </Link>
      </div>
    </div>
  )
}

export default NotFoundPage
