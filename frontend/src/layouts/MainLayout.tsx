import React, { useState } from 'react'
import { Outlet, Link, useLocation, NavLink } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import {
  LayoutDashboard,
  FileText,
  Cube,
  Settings,
  User,
  LogOut,
  Menu,
  X,
  Sun,
  Moon,
  Monitor,
  Bell,
  Shield,
  Users,
  ClipboardList,
  Database,
  Cpu,
  ChevronDown,
} from 'lucide-react'
import { cn } from '../lib/utils'

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Tasks', href: '/tasks', icon: FileText },
  { name: 'Models', href: '/models', icon: Cube },
]

const adminNavigation = [
  { name: 'Overview', href: '/admin', icon: LayoutDashboard },
  { name: 'Users', href: '/admin/users', icon: Users },
  { name: 'Tasks', href: '/admin/tasks', icon: ClipboardList },
  { name: 'Models', href: '/admin/models', icon: Cpu },
  { name: 'Audit Logs', href: '/admin/audit-logs', icon: Database },
  { name: 'System Health', href: '/admin/health/detailed', icon: Shield },
]

export function MainLayout() {
  const { user, logout, hasRole } = useAuth()
  const { theme, resolvedTheme, setTheme, toggleTheme } = useTheme()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [themeMenuOpen, setThemeMenuOpen] = useState(false)

  const isAdmin = hasRole('admin')

  return (
    <div className="min-h-screen bg-surface-50 dark:bg-surface-900">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-64 bg-white dark:bg-surface-800 border-r border-surface-200 dark:border-surface-700 transform transition-transform duration-300 ease-in-out lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
        aria-label="Main navigation"
      >
        <div className="flex h-16 items-center px-6 border-b border-surface-200 dark:border-surface-700">
          <Link to="/dashboard" className="flex items-center gap-2" aria-label="MedSeg Home">
            <div className="w-8 h-8 rounded-lg bg-primary-600 flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <span className="text-xl font-bold text-surface-900 dark:text-white">MedSeg</span>
          </Link>
        </div>

        <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto" role="navigation" aria-label="Main">
          <ul className="space-y-1" role="list">
            {navigation.map((item) => {
              const isActive = location.pathname === item.href || location.pathname.startsWith(item.href + '/')
              return (
                <li key={item.name}>
                  <NavLink
                    to={item.href}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                        isActive
                          ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
                          : 'text-surface-600 hover:bg-surface-100 dark:text-surface-400 dark:hover:bg-surface-800'
                      )
                    }
                    aria-current={isActive ? 'page' : undefined}
                  >
                    <item.icon className="w-5 h-5 flex-shrink-0" aria-hidden="true" />
                    {item.name}
                  </NavLink>
                </li>
              )
            })}
          </ul>

          {isAdmin && (
            <>
              <div className="pt-4 pb-2 px-3">
                <h3 className="text-xs font-semibold text-surface-500 dark:text-surface-400 uppercase tracking-wider">
                  Administration
                </h3>
              </div>
              <ul className="space-y-1" role="list">
                {adminNavigation.map((item) => {
                  const isActive = location.pathname === item.href || location.pathname.startsWith(item.href + '/')
                  return (
                    <li key={item.name}>
                      <NavLink
                        to={item.href}
                        className={({ isActive }) =>
                          cn(
                            'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                            isActive
                              ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
                              : 'text-surface-600 hover:bg-surface-100 dark:text-surface-400 dark:hover:bg-surface-800'
                          )
                        }
                        aria-current={isActive ? 'page' : undefined}
                      >
                        <item.icon className="w-5 h-5 flex-shrink-0" aria-hidden="true" />
                        {item.name}
                      </NavLink>
                    </li>
                  )
                })}
              </ul>
            </>
          )}
        </nav>

        <div className="p-4 border-t border-surface-200 dark:border-surface-700">
          <Link
            to="/profile"
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-surface-600 hover:bg-surface-100 dark:text-surface-400 dark:hover:bg-surface-800 transition-colors"
          >
            <User className="w-5 h-5 flex-shrink-0" aria-hidden="true" />
            Profile
          </Link>
        </div>
      </aside>

      {/* Main content */}
      <div className="lg:pl-64">
        {/* Top bar */}
        <header className="sticky top-0 z-30 h-16 bg-white/80 dark:bg-surface-800/80 backdrop-blur-medical border-b border-surface-200 dark:border-surface-700">
          <div className="flex h-full items-center justify-between px-4 lg:px-6">
            {/* Mobile menu button */}
            <button
              className="lg:hidden p-2 rounded-lg text-surface-600 hover:bg-surface-100 dark:text-surface-400 dark:hover:bg-surface-800"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open menu"
              aria-expanded={sidebarOpen}
            >
              <Menu className="w-6 h-6" aria-hidden="true" />
            </button>

            {/* Page title */}
            <div className="flex-1 lg:hidden">
              <h1 className="text-lg font-semibold text-surface-900 dark:text-white truncate">
                {getPageTitle(location.pathname)}
              </h1>
            </div>

            {/* Right side actions */}
            <div className="flex items-center gap-2">
              {/* Theme toggle */}
              <div className="relative">
                <button
                  className="p-2 rounded-lg text-surface-600 hover:bg-surface-100 dark:text-surface-400 dark:hover:bg-surface-800"
                  onClick={toggleTheme}
                  aria-label={`Switch to ${resolvedTheme === 'light' ? 'dark' : 'light'} mode`}
                >
                  {resolvedTheme === 'light' ? (
                    <Moon className="w-5 h-5" aria-hidden="true" />
                  ) : (
                    <Sun className="w-5 h-5" aria-hidden="true" />
                  )}
                </button>
              </div>

              {/* Notifications */}
              <button className="relative p-2 rounded-lg text-surface-600 hover:bg-surface-100 dark:text-surface-400 dark:hover:bg-surface-800" aria-label="Notifications">
                <Bell className="w-5 h-5" aria-hidden="true" />
                <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" aria-hidden="true" />
              </button>

              {/* User menu */}
              <div className="relative">
                <button
                  className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800"
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  aria-expanded={userMenuOpen}
                  aria-haspopup="true"
                >
                  <div className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                    <span className="text-sm font-medium text-primary-700 dark:text-primary-300">
                      {user?.full_name?.charAt(0).toUpperCase() || 'U'}
                    </span>
                  </div>
                  <span className="hidden sm:block text-sm font-medium text-surface-700 dark:text-surface-300">
                    {user?.full_name}
                  </span>
                  <ChevronDown className="w-4 h-4 text-surface-500 dark:text-surface-400" aria-hidden="true" />
                </button>

                {userMenuOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setUserMenuOpen(false)}
                      aria-hidden="true"
                    />
                    <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-surface-800 rounded-lg shadow-medical-lg border border-surface-200 dark:border-surface-700 py-1 z-50">
                      <div className="px-4 py-3 border-b border-surface-200 dark:border-surface-700">
                        <p className="text-sm font-medium text-surface-900 dark:text-white">{user?.full_name}</p>
                        <p className="text-xs text-surface-500 dark:text-surface-400">{user?.email}</p>
                        <span className={cn('badge mt-1', getRoleBadge(user?.role))}>{user?.role}</span>
                      </div>
                      <Link
                        to="/profile"
                        className="flex items-center gap-2 px-4 py-2 text-sm text-surface-700 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-700"
                        onClick={() => setUserMenuOpen(false)}
                      >
                        <User className="w-4 h-4" aria-hidden="true" />
                        Profile
                      </Link>
                      <Link
                        to="/settings"
                        className="flex items-center gap-2 px-4 py-2 text-sm text-surface-700 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-700"
                        onClick={() => setUserMenuOpen(false)}
                      >
                        <Settings className="w-4 h-4" aria-hidden="true" />
                        Settings
                      </Link>
                      <hr className="my-1 border-surface-200 dark:border-surface-700" />
                      <button
                        onClick={() => logout()}
                        className="flex items-center gap-2 w-full px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-surface-100 dark:hover:bg-surface-700"
                      >
                        <LogOut className="w-4 h-4" aria-hidden="true" />
                        Sign out
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="p-4 lg:p-6" role="main" aria-label="Page content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

function getPageTitle(pathname: string): string {
  const titles: Record<string, string> = {
    '/dashboard': 'Dashboard',
    '/tasks': 'Tasks',
    '/models': 'Models',
    '/profile': 'Profile',
    '/settings': 'Settings',
    '/admin': 'Admin Dashboard',
    '/admin/users': 'User Management',
    '/admin/tasks': 'Task Management',
    '/admin/models': 'Model Registry',
    '/admin/audit-logs': 'Audit Logs',
  }

  for (const [path, title] of Object.entries(titles)) {
    if (pathname === path || pathname.startsWith(path + '/')) {
      return title
    }
  }
  return 'MedSeg'
}

function getRoleBadge(role?: string): string {
  const badges: Record<string, string> = {
    admin: 'badge-danger',
    radiologist: 'badge-primary',
    researcher: 'badge-info',
    viewer: 'badge-secondary',
  }
  return badges[role || ''] || 'badge-secondary'
}