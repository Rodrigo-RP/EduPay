import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { useInstitution } from "@/hooks/use-institution";
import TrainingModal from "@/components/training-modal";

export default function Sidebar() {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { institutionName, campusName, logoUrl } = useInstitution();
  const [trainingOpen, setTrainingOpen] = useState(false);

  const menuItems = [
    { 
      icon: "fas fa-chart-line", 
      label: "Dashboard", 
      href: "/admin", 
      active: location === "/" || location === "/admin",
      category: "principal"
    },
    { 
      icon: "fas fa-users", 
      label: "Estudiantes", 
      href: "/estudiantes", 
      active: location === "/estudiantes",
      category: "academico"
    },
    { 
      icon: "fas fa-home", 
      label: "Familias", 
      href: "/familias", 
      active: location === "/familias",
      category: "academico"
    },
    { 
      icon: "fas fa-graduation-cap", 
      label: "Ex-Alumnos", 
      href: "/exalumnos", 
      active: location === "/exalumnos",
      category: "academico"
    },
    { 
      icon: "fas fa-user-friends", 
      label: "CRM Escolar", 
      href: "/crm-escolar", 
      active: location === "/crm-escolar",
      category: "academico"
    },
    { 
      icon: "fas fa-user-cog", 
      label: "Usuarios", 
      href: "/usuarios", 
      active: location === "/usuarios",
      category: "administrativo"
    },
    { 
      icon: "fas fa-file-invoice-dollar", 
      label: "Cargos", 
      href: "/cargos", 
      active: location === "/cargos",
      category: "financiero"
    },
    { 
      icon: "fas fa-credit-card", 
      label: "Pagos", 
      href: "/pagos", 
      active: location === "/pagos",
      category: "financiero"
    },
    { 
      icon: "fas fa-exclamation-triangle", 
      label: "Cuentas por Cobrar", 
      href: "/cuentas-por-cobrar", 
      active: location === "/cuentas-por-cobrar",
      category: "financiero"
    },
    { 
      icon: "fas fa-box", 
      label: "Catálogo Productos", 
      href: "/catalogo-productos", 
      active: location === "/catalogo-productos",
      category: "financiero"
    },
    { 
      icon: "fas fa-tags", 
      label: "Asignación de Precios", 
      href: "/asignacion-precios", 
      active: location === "/asignacion-precios",
      category: "financiero"
    },
    { 
      icon: "fas fa-building", 
      label: "Proveedores", 
      href: "/proveedores", 
      active: location === "/proveedores",
      category: "administrativo"
    },
    { 
      icon: "fas fa-percent", 
      label: "Becas y Descuentos", 
      href: "/becas", 
      active: location === "/becas",
      category: "financiero"
    },
    { 
      icon: "fas fa-file-import", 
      label: "Importación de Datos", 
      href: "/importacion-datos", 
      active: location === "/importacion-datos",
      category: "sistema"
    },
    { 
      icon: "fas fa-bell", 
      label: "Notificaciones", 
      href: "/notificaciones", 
      active: location === "/notificaciones",
      category: "sistema"
    },
    { 
      icon: "fas fa-chart-bar", 
      label: "Reportes", 
      href: "/reportes", 
      active: location === "/reportes",
      category: "sistema"
    },
    { 
      icon: "fas fa-cog", 
      label: "Configuración", 
      href: "/configuracion", 
      active: location === "/configuracion",
      category: "sistema"
    },
    { 
      icon: "fas fa-brain", 
      label: "Sistemas Avanzados", 
      href: "/sistemas-avanzados", 
      active: location === "/sistemas-avanzados",
      category: "sistema"
    },
  ];

  return (
    <aside className="w-64 bg-white border-r border-slate-200 flex flex-col">
      <div className="p-6">
        <div className="flex items-center space-x-3">
          <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg overflow-hidden">
            {logoUrl ? (
              <img src={logoUrl} alt="Logo institucional" className="w-full h-full object-cover" />
            ) : (
              <i className="fas fa-university text-white text-lg"></i>
            )}
          </div>
          <div className="flex-1">
            <h1 className="text-lg font-bold text-slate-900 leading-tight">{institutionName}</h1>
            <p className="text-xs text-slate-500">{campusName}</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-4 pb-6 overflow-y-auto">
        <div className="space-y-4">
          {/* Sección Principal */}
          <div>
            <h3 className="px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Principal</h3>
            <div className="mt-2 space-y-1">
              {menuItems.filter(item => item.category === "principal").map((item, index) => (
                <a
                  key={index}
                  href={item.href}
                  onClick={(e) => {
                    e.preventDefault();
                    setLocation(item.href);
                  }}
                  className={`group flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors cursor-pointer ${
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
          </div>

          {/* Sección Académica */}
          <div>
            <h3 className="px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Académico</h3>
            <div className="mt-2 space-y-1">
              {menuItems.filter(item => item.category === "academico").map((item, index) => (
                <a
                  key={index}
                  href={item.href}
                  onClick={(e) => {
                    e.preventDefault();
                    setLocation(item.href);
                  }}
                  className={`group flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors cursor-pointer ${
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
          </div>

          {/* Sección Financiera */}
          <div>
            <h3 className="px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Financiero</h3>
            <div className="mt-2 space-y-1">
              {menuItems.filter(item => item.category === "financiero").map((item, index) => (
                <a
                  key={index}
                  href={item.href}
                  onClick={(e) => {
                    e.preventDefault();
                    setLocation(item.href);
                  }}
                  className={`group flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors cursor-pointer ${
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
          </div>

          {/* Sección Administrativa */}
          <div>
            <h3 className="px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Administrativo</h3>
            <div className="mt-2 space-y-1">
              {menuItems.filter(item => item.category === "administrativo").map((item, index) => (
                <a
                  key={index}
                  href={item.href}
                  onClick={(e) => {
                    e.preventDefault();
                    setLocation(item.href);
                  }}
                  className={`group flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors cursor-pointer ${
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
          </div>

          {/* Sección Sistema */}
          <div>
            <h3 className="px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Sistema</h3>
            <div className="mt-2 space-y-1">
              {menuItems.filter(item => item.category === "sistema").map((item, index) => (
                <a
                  key={index}
                  href={item.href}
                  onClick={(e) => {
                    e.preventDefault();
                    setLocation(item.href);
                  }}
                  className={`group flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors cursor-pointer ${
                    item.active
                      ? "bg-primary-50 text-primary-700"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                >
                  <i className={`${item.icon} mr-3 text-sm`}></i>
                  {item.label}
                </a>
              ))}
              
              {/* Botón de Capacitación */}
              <button
                onClick={() => setTrainingOpen(true)}
                className="group flex items-center w-full px-3 py-2 text-sm font-medium rounded-lg transition-colors cursor-pointer text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              >
                <i className="fas fa-graduation-cap mr-3 text-sm"></i>
                Capacitación
              </button>
            </div>
          </div>
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
      
      <TrainingModal open={trainingOpen} onOpenChange={setTrainingOpen} />
    </aside>
  );
}
