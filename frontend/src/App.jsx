// src/App.jsx
import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'

// Páginas de Auth
import LoginPage    from './pages/auth/LoginPage'
import RegisterPage from './pages/auth/RegisterPage'

// Layout do cliente
import ClientLayout from './components/layout/ClientLayout'

// Páginas do cliente
import DashboardPage      from './pages/client/DashboardPage'
import ConversationsPage  from './pages/client/ConversationsPage'
import ContactsPage       from './pages/client/ContactsPage'
import AppointmentsPage   from './pages/client/AppointmentsPage'
import SettingsPage       from './pages/client/SettingsPage'
import IntegrationsPage   from './pages/client/IntegrationsPage'

// Admin
import AdminPage from './pages/admin/AdminPage'

function PrivateRoute({ children }) {
  const { client, loading } = useAuth()
  if (loading) return <LoadingScreen />
  if (!client) return <Navigate to="/login" replace />
  return children
}

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-surface-200 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-gray-500">Carregando...</p>
      </div>
    </div>
  )
}

function AppRoutes() {
  const { client } = useAuth()

  return (
    <Routes>
      {/* Públicas */}
      <Route path="/login"    element={client ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/register" element={client ? <Navigate to="/" replace /> : <RegisterPage />} />

      {/* Admin */}
      <Route path="/admin" element={<AdminPage />} />

      {/* Painel do cliente */}
      <Route path="/" element={
        <PrivateRoute>
          <ClientLayout />
        </PrivateRoute>
      }>
        <Route index                  element={<DashboardPage />} />
        <Route path="conversations"   element={<ConversationsPage />} />
        <Route path="contacts"        element={<ContactsPage />} />
        <Route path="appointments"    element={<AppointmentsPage />} />
        <Route path="settings"        element={<SettingsPage />} />
        <Route path="integrations"    element={<IntegrationsPage />} />
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  )
}
