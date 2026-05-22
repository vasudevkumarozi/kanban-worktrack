import { NavLink } from 'react-router-dom';
import { LayoutDashboard, FolderKanban, CheckSquare, Users, BarChart2, LogOut, ChevronRight, FileText } from 'lucide-react';
import { useAuthStore } from '../../store/auth.store';
import { disconnectSocket } from '../../hooks/useSocket';

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/my-tasks', icon: CheckSquare, label: 'My Tasks' },
  { to: '/projects', icon: FolderKanban, label: 'Projects' },
];

const adminItems = [
  { to: '/admin/analytics', icon: BarChart2, label: 'Analytics', roles: ['SUPER_ADMIN', 'MANAGER'] },
  { to: '/reports', icon: FileText, label: 'Reports', roles: ['SUPER_ADMIN', 'MANAGER'] },
  { to: '/admin/users', icon: Users, label: 'User Management', roles: ['SUPER_ADMIN', 'MANAGER'] },
];

export default function Sidebar() {
  const { user, logout } = useAuthStore();

  const handleLogout = () => {
    disconnectSocket();
    logout();
  };

  return (
    <aside className="w-64 bg-gray-900 text-white flex flex-col h-screen sticky top-0">
      <div className="p-6 border-b border-gray-800">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-primary-500 rounded-lg flex items-center justify-center">
            <FolderKanban size={18} />
          </div>
          <span className="font-bold text-lg">WorkTrack</span>
        </div>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${isActive ? 'bg-primary-600 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`
            }
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}

        {adminItems.some(item => item.roles.includes(user?.role || '')) && (
          <div className="pt-4">
            <p className="px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Admin</p>
            {adminItems
              .filter(item => item.roles.includes(user?.role || ''))
              .map(({ to, icon: Icon, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${isActive ? 'bg-primary-600 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`
                  }
                >
                  <Icon size={18} />
                  {label}
                  <ChevronRight size={14} className="ml-auto" />
                </NavLink>
              ))}
          </div>
        )}
      </nav>

      <div className="p-4 border-t border-gray-800">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-full bg-primary-500 flex items-center justify-center text-sm font-bold">
            {user?.name?.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{user?.name}</p>
            <p className="text-xs text-gray-400 truncate">{user?.role?.replace('_', ' ')}</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-400 hover:text-red-400 hover:bg-gray-800 rounded-lg transition-colors"
        >
          <LogOut size={16} />
          Logout
        </button>
      </div>
    </aside>
  );
}
