import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/authStore'

// Layouts
import MainLayout from './layouts/MainLayout'
import AuthLayout from './layouts/AuthLayout'
import PublicLayout from './layouts/PublicLayout'

// Public pages (no login)
import Home from './pages/public/Home'
import RegisterTeam from './pages/public/RegisterTeam'
import PublicResults from './pages/public/PublicResults'

// Admin login
import Login from './pages/auth/Login'

// Admin console
import AdminCompetitions from './pages/admin/AdminCompetitions'
import AdminCompetitionDetail from './pages/admin/AdminCompetitionDetail'
import CompetitionEditor from './pages/admin/CompetitionEditor'
import ScoringBoard from './pages/admin/ScoringBoard'
import AdminResults from './pages/admin/AdminResults'

// The admin is the only login. Teams register from the public home page.
const AdminRoute = ({ children }) => {
  const { isAuthenticated, user, logout } = useAuthStore()

  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (user?.role !== 'admin') {
    // A leftover non-admin session from the old multi-role app
    logout()
    return <Navigate to="/login" replace />
  }
  return children
}

function App() {
  return (
    <Routes>
      {/* Public */}
      <Route element={<PublicLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/register-team/:competitionId" element={<RegisterTeam />} />
        <Route path="/results/:competitionId" element={<PublicResults />} />
      </Route>

      {/* Admin login */}
      <Route element={<AuthLayout />}>
        <Route path="/login" element={<Login />} />
      </Route>

      {/* Admin console */}
      <Route element={<AdminRoute><MainLayout /></AdminRoute>}>
        <Route path="/admin" element={<AdminCompetitions />} />
        <Route path="/admin/competitions/new" element={<CompetitionEditor />} />
        <Route path="/admin/competitions/:id" element={<AdminCompetitionDetail />} />
        <Route path="/admin/competitions/:id/edit" element={<CompetitionEditor />} />
        <Route path="/admin/competitions/:id/scoring" element={<ScoringBoard />} />
        <Route path="/admin/competitions/:id/results" element={<AdminResults />} />
      </Route>

      {/* Old bookmarks */}
      <Route path="/dashboard" element={<Navigate to="/admin" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
