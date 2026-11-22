import { Link, Outlet } from 'react-router-dom'
import { FiLock } from 'react-icons/fi'
import { useAuthStore } from '../store/authStore'

// Shell for the public pages: landing, team registration and live results
const PublicLayout = () => {
  const { isAuthenticated } = useAuthStore()

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <span className="text-2xl">🏆</span>
            <span>
              <span className="block font-bold text-primary-600 leading-tight">Mallakhamb</span>
              <span className="block text-xs text-gray-500 leading-tight">Competition Manager</span>
            </span>
          </Link>
          <Link
            to={isAuthenticated ? '/admin' : '/login'}
            className="text-sm text-gray-600 hover:text-primary-600 inline-flex items-center gap-1"
          >
            <FiLock className="w-4 h-4" />
            {isAuthenticated ? 'Admin console' : 'Admin login'}
          </Link>
        </div>
      </header>

      <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-8">
        <Outlet />
      </main>

      <footer className="text-center text-xs text-gray-400 py-6">
        Mallakhamb Competition Manager
      </footer>
    </div>
  )
}

export default PublicLayout
