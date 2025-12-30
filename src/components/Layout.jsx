import { NavLink, Outlet } from 'react-router-dom';

export default function Layout() {
  const linkClass = ({ isActive }) =>
    `relative px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${
      isActive
        ? 'text-indigo-600 bg-indigo-50'
        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
    }`;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Modern Header */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-slate-200/60">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center shadow-sm">
                <span className="text-white font-bold text-lg">Q</span>
              </div>
              <span className="text-lg font-semibold text-slate-900 tracking-tight">
                Boarding Manager
              </span>
            </div>

            {/* Navigation */}
            <nav className="flex items-center gap-1 p-1 bg-slate-100/80 rounded-xl">
              <NavLink to="/" className={linkClass}>
                Dashboard
              </NavLink>
              <NavLink to="/dogs" className={linkClass}>
                Dogs
              </NavLink>
              <NavLink to="/settings" className={linkClass}>
                Settings
              </NavLink>
            </nav>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}
