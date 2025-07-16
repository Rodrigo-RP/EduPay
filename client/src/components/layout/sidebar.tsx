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
      icon: "fas fa-chart-line", 
      label: "Análisis Financiero CFO", 
      href: "/analisis-financiero", 
      active: location === "/analisis-financiero",
      category: "financiero"
    },
    { 
      icon: "fas fa-file-alt", 
      label: "Reportes Financieros", 
      href: "/reportes-financieros", 
      active: location === "/reportes-financieros",
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
      icon: "fas fa-calendar-check", 
      label: "Configuración de Pagos", 
      href: "/configuracion-pagos", 
      active: location === "/configuracion-pagos",
      category: "sistema"
    },
    { 
      icon: "fas fa-brain", 
      label: "Sistemas Avanzados", 
      href: "/sistemas-avanzados", 
      active: location === "/sistemas-avanzados",
      category: "sistema"
    },
    { 
      icon: "fas fa-shield-alt", 
      label: "Aprobaciones", 
      href: "/aprobaciones", 
      active: location === "/aprobaciones",
      category: "sistema"
    },

  ];

  // Función para obtener los colores de cada sección
  const getSectionColors = (category: string) => {
    switch (category) {
      case "principal":
        return {
          titleColor: "text-blue-600",
          activeBackground: "bg-blue-50",
          activeText: "text-blue-700",
          hoverBackground: "hover:bg-blue-25",
          borderColor: "border-l-blue-400"
        };
      case "academico":
        return {
          titleColor: "text-green-600",
          activeBackground: "bg-green-50",
          activeText: "text-green-700",
          hoverBackground: "hover:bg-green-25",
          borderColor: "border-l-green-400"
        };
      case "financiero":
        return {
          titleColor: "text-yellow-600",
          activeBackground: "bg-yellow-50",
          activeText: "text-yellow-700",
          hoverBackground: "hover:bg-yellow-25",
          borderColor: "border-l-yellow-400"
        };
      case "administrativo":
        return {
          titleColor: "text-purple-600",
          activeBackground: "bg-purple-50",
          activeText: "text-purple-700",
          hoverBackground: "hover:bg-purple-25",
          borderColor: "border-l-purple-400"
        };
      case "sistema":
        return {
          titleColor: "text-red-600",
          activeBackground: "bg-red-50",
          activeText: "text-red-700",
          hoverBackground: "hover:bg-red-25",
          borderColor: "border-l-red-400"
        };
      default:
        return {
          titleColor: "text-slate-500",
          activeBackground: "bg-primary-50",
          activeText: "text-primary-700",
          hoverBackground: "hover:bg-slate-50",
          borderColor: "border-l-gray-400"
        };
    }
  };

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
            <h3 className={`px-3 text-xs font-semibold uppercase tracking-wider ${getSectionColors("principal").titleColor}`}>
              <i className="fas fa-home mr-2"></i>Principal
            </h3>
            <div className="mt-2 space-y-1">
              {menuItems.filter(item => item.category === "principal").map((item, index) => {
                const colors = getSectionColors("principal");
                return (
                  <a
                    key={index}
                    href={item.href}
                    onClick={(e) => {
                      e.preventDefault();
                      setLocation(item.href);
                    }}
                    className={`group flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors cursor-pointer border-l-4 ${
                      item.active
                        ? `${colors.activeBackground} ${colors.activeText} ${colors.borderColor}`
                        : `text-slate-600 hover:bg-slate-50 hover:text-slate-900 border-l-transparent ${colors.hoverBackground}`
                    }`}
                  >
                    <i className={`${item.icon} mr-3 text-sm`}></i>
                    {item.label}
                  </a>
                );
              })}
            </div>
          </div>

          {/* Sección Académica */}
          <div>
            <h3 className={`px-3 text-xs font-semibold uppercase tracking-wider ${getSectionColors("academico").titleColor}`}>
              <i className="fas fa-graduation-cap mr-2"></i>Académico
            </h3>
            <div className="mt-2 space-y-1">
              {menuItems.filter(item => item.category === "academico").map((item, index) => {
                const colors = getSectionColors("academico");
                return (
                  <a
                    key={index}
                    href={item.href}
                    onClick={(e) => {
                      e.preventDefault();
                      setLocation(item.href);
                    }}
                    className={`group flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors cursor-pointer border-l-4 ${
                      item.active
                        ? `${colors.activeBackground} ${colors.activeText} ${colors.borderColor}`
                        : `text-slate-600 hover:bg-slate-50 hover:text-slate-900 border-l-transparent ${colors.hoverBackground}`
                    }`}
                  >
                    <i className={`${item.icon} mr-3 text-sm`}></i>
                    {item.label}
                  </a>
                );
              })}
            </div>
          </div>

          {/* Sección Financiera */}
          <div>
            <h3 className={`px-3 text-xs font-semibold uppercase tracking-wider ${getSectionColors("financiero").titleColor}`}>
              <i className="fas fa-dollar-sign mr-2"></i>Financiero
            </h3>
            <div className="mt-2 space-y-1">
              {menuItems.filter(item => item.category === "financiero").map((item, index) => {
                const colors = getSectionColors("financiero");
                return (
                  <a
                    key={index}
                    href={item.href}
                    onClick={(e) => {
                      e.preventDefault();
                      setLocation(item.href);
                    }}
                    className={`group flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors cursor-pointer border-l-4 ${
                      item.active
                        ? `${colors.activeBackground} ${colors.activeText} ${colors.borderColor}`
                        : `text-slate-600 hover:bg-slate-50 hover:text-slate-900 border-l-transparent ${colors.hoverBackground}`
                    }`}
                  >
                    <i className={`${item.icon} mr-3 text-sm`}></i>
                    {item.label}
                  </a>
                );
              })}
            </div>
          </div>

          {/* Sección Administrativa */}
          <div>
            <h3 className={`px-3 text-xs font-semibold uppercase tracking-wider ${getSectionColors("administrativo").titleColor}`}>
              <i className="fas fa-clipboard-list mr-2"></i>Administrativo
            </h3>
            <div className="mt-2 space-y-1">
              {menuItems.filter(item => item.category === "administrativo").map((item, index) => {
                const colors = getSectionColors("administrativo");
                return (
                  <a
                    key={index}
                    href={item.href}
                    onClick={(e) => {
                      e.preventDefault();
                      setLocation(item.href);
                    }}
                    className={`group flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors cursor-pointer border-l-4 ${
                      item.active
                        ? `${colors.activeBackground} ${colors.activeText} ${colors.borderColor}`
                        : `text-slate-600 hover:bg-slate-50 hover:text-slate-900 border-l-transparent ${colors.hoverBackground}`
                    }`}
                  >
                    <i className={`${item.icon} mr-3 text-sm`}></i>
                    {item.label}
                  </a>
                );
              })}
            </div>
          </div>

          {/* Sección Sistema */}
          <div>
            <h3 className={`px-3 text-xs font-semibold uppercase tracking-wider ${getSectionColors("sistema").titleColor}`}>
              <i className="fas fa-cog mr-2"></i>Sistema
            </h3>
            <div className="mt-2 space-y-1">
              {menuItems.filter(item => item.category === "sistema").map((item, index) => {
                const colors = getSectionColors("sistema");
                return (
                  <a
                    key={index}
                    href={item.href}
                    onClick={(e) => {
                      e.preventDefault();
                      setLocation(item.href);
                    }}
                    className={`group flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors cursor-pointer border-l-4 ${
                      item.active
                        ? `${colors.activeBackground} ${colors.activeText} ${colors.borderColor}`
                        : `text-slate-600 hover:bg-slate-50 hover:text-slate-900 border-l-transparent ${colors.hoverBackground}`
                    }`}
                  >
                    <i className={`${item.icon} mr-3 text-sm`}></i>
                    {item.label}
                  </a>
                );
              })}
              
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
