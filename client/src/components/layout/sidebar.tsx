import { useAuth } from "@/hooks/use-auth";

export default function Sidebar() {
  const { user, logout } = useAuth();

  const menuItems = [
    { icon: "fas fa-chart-line", label: "Dashboard", active: true },
    { icon: "fas fa-users", label: "Estudiantes", active: false },
    { icon: "fas fa-file-invoice-dollar", label: "Cargos", active: false },
    { icon: "fas fa-credit-card", label: "Pagos", active: false },
    { icon: "fas fa-percent", label: "Becas y Descuentos", active: false },
    { icon: "fas fa-bell", label: "Notificaciones", active: false },
    { icon: "fas fa-chart-bar", label: "Reportes", active: false },
    { icon: "fas fa-cog", label: "Configuración", active: false },
  ];

  return (
    <aside className="w-64 bg-white border-r border-slate-200 flex flex-col">
      <div className="p-6">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-primary-600 rounded-xl flex items-center justify-center">
            <i className="fas fa-graduation-cap text-white"></i>
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">EscuelaPay</h1>
            <p className="text-sm text-slate-500">Admin Portal</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-4 pb-6">
        <div className="space-y-1">
          {menuItems.map((item, index) => (
            <a
              key={index}
              href="#"
              className={`group flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                item.active
                  ? "bg-primary-50 text-primary-700"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              <i className={`${item.icon} mr-3 text-sm`}></i>
              {item.label}
            </a>
          ))}
        </div>
      </nav>

      <div className="p-4 border-t border-slate-200">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-slate-300 rounded-full flex items-center justify-center">
            <span className="text-slate-600 font-medium text-sm">
              {user?.email?.charAt(0).toUpperCase() || "A"}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-900 truncate">
              {user?.email || "Administrador"}
            </p>
            <p className="text-xs text-slate-500 capitalize">
              {user?.role || "admin"}
            </p>
          </div>
          <button 
            onClick={logout}
            className="text-slate-400 hover:text-slate-600 transition-colors"
            title="Cerrar sesión"
          >
            <i className="fas fa-sign-out-alt"></i>
          </button>
        </div>
      </div>
    </aside>
  );
}
