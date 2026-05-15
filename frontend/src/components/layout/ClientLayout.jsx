// src/components/layout/ClientLayout.jsx
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import {
  LayoutDashboard, MessageSquare, Users, Calendar,
  Settings, Zap, LogOut, Menu, X, Bot, ChevronRight,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'

const NAV = [
  { to: '/',              icon: LayoutDashboard, label: 'Dashboard',    end: true },
  { to: '/conversations', icon: MessageSquare,   label: 'Conversas' },
  { to: '/contacts',      icon: Users,           label: 'Contatos' },
  { to: '/appointments',  icon: Calendar,        label: 'Agendamentos' },
  { to: '/settings',      icon: Settings,        label: 'Configurações' },
  { to: '/integrations',  icon: Zap,             label: 'Integrações' },
]

export default function ClientLayout() {
  const { client, logout } = useAuth()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="flex h-screen bg-surface-200 overflow-hidden">

      {/* Overlay mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed lg:static inset-y-0 left-0 z-30 w-60 flex flex-col
        bg-surface-100 border-r border-white/[0.06]
        transform transition-transform duration-200
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>

        {/* Logo */}
        <div className="flex items-center gap-2.5 px-5 py-5 border-b border-white/[0.06]">
          <div className="w-8 h-8 bg-brand-500 rounded-lg flex items-center justify-center flex-shrink-0">
            <Bot size={16} className="text-white" />
          </div>
          <span className="font-semibold text-white tracking-tight">GbZap</span>
          <button
            className="ml-auto lg:hidden text-gray-400 hover:text-white"
            onClick={() => setSidebarOpen(false)}
          >
            <X size={16} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {NAV.map(({ to, icon: Icon, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `nav-link ${isActive ? 'active' : ''}`
              }
              onClick={() => setSidebarOpen(false)}
            >
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Perfil + logout */}
        <div className="p-3 border-t border-white/[0.06]">
          <div className="flex items-center gap-2.5 px-2 py-2 rounded-lg">
            <div className="w-7 h-7 bg-brand-500/20 rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-semibold text-brand-400">
                {client?.name?.charAt(0)?.toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-200 truncate">{client?.name}</p>
              <p className="text-[10px] text-gray-500 truncate">{client?.email}</p>
            </div>
            <button
              onClick={handleLogout}
              className="text-gray-500 hover:text-red-400 transition-colors p-1"
              title="Sair"
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </aside>

      {/* Conteúdo principal */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Topbar mobile */}
        <div className="lg:hidden flex items-center gap-3 px-4 py-3 border-b border-white/[0.06] bg-surface-100">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-gray-400 hover:text-white"
          >
            <Menu size={20} />
          </button>
          <div className="flex items-center gap-2">
            <Bot size={16} className="text-brand-500" />
            <span className="font-semibold text-sm text-white">GbZap</span>
          </div>
        </div>

        {/* Página */}
        <div className="flex-1 overflow-y-auto">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
