import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { useInstitution } from "@/hooks/use-institution";
import TrainingModal from "@/components/training-modal";
import { hasPermission, MODULES, ACTIONS, UserRole } from "@shared/permissions";

export default function Sidebar() {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { institutionName, campusName, logoUrl } = useInstitution();
  const [trainingOpen, setTrainingOpen] = useState(false);

  const userRole = (user?.role as UserRole) || 'asistente';

  // Definir elementos del menú con permisos
  const getAllMenuItems = () => [
    { 
      icon: "fas fa-chart-line", 
      label: "Dashboard", 
      href: "/admin", 
      active: location === "/" || location === "/admin",
      category: "principal",
      module: MODULES.DASHBOARD,
      action: ACTIONS.READ
    },
    { 
      icon: "fas fa-users", 
      label: "Estudiantes", 
      href: "/estudiantes", 
      active: location === "/estudiantes",
      category: "academico",
      module: MODULES.STUDENTS,
      action: ACTIONS.READ
    },
    { 
      icon: "fas fa-home", 
      label: "Familias", 
      href: "/familias", 
      active: location === "/familias",
      category: "academico",
      module: MODULES.FAMILIES,
      action: ACTIONS.READ
    },
    { 
      icon: "fas fa-graduation-cap", 
      label: "Ex-Alumnos", 
      href: "/exalumnos", 
      active: location === "/exalumnos",
      category: "academico",
      module: MODULES.ALUMNI,
      action: ACTIONS.READ
    },
    { 
      icon: "fas fa-user-friends", 
      label: "CRM Escolar", 
      href: "/crm-escolar", 
      active: location === "/crm-escolar",
      category: "academico",
      module: MODULES.CRM,
      action: ACTIONS.READ
    },
    { 
      icon: "fas fa-user-cog", 
      label: "Usuarios", 
      href: "/usuarios", 
      active: location === "/usuarios",
      category: "administrativo",
      module: MODULES.USERS,
      action: ACTIONS.READ
    },
    { 
      icon: "fas fa-file-invoice-dollar", 
      label: "Cargos", 
      href: "/cargos", 
      active: location === "/cargos",
      category: "financiero",
      module: MODULES.CHARGES,
      action: ACTIONS.READ
    },
    { 
      icon: "fas fa-credit-card", 
      label: "Pagos", 
      href: "/pagos", 
      active: location === "/pagos",
      category: "financiero",
      module: MODULES.PAYMENTS,
      action: ACTIONS.READ
    },
    { 
      icon: "fas fa-exclamation-triangle", 
      label: "Cuentas por Cobrar", 
      href: "/cuentas-por-cobrar", 
      active: location === "/cuentas-por-cobrar",
      category: "financiero",
      module: MODULES.RECEIVABLES,
      action: ACTIONS.READ
    },
    { 
      icon: "fas fa-chart-line", 
      label: "Análisis Financiero CFO", 
      href: "/analisis-financiero", 
      active: location === "/analisis-financiero",
      category: "financiero",
      module: MODULES.FINANCIAL,
      action: ACTIONS.READ
    },
    { 
      icon: "fas fa-file-alt", 
      label: "Reportes Financieros", 
      href: "/reportes-financieros", 
      active: location === "/reportes-financieros",
      category: "financiero",
      module: MODULES.REPORTS,
      action: ACTIONS.READ
    },
    { 
      icon: "fas fa-box", 
      label: "Catálogo Productos", 
      href: "/catalogo-productos", 
      active: location === "/catalogo-productos",
      category: "financiero",
      module: MODULES.CONCEPTS,
      action: ACTIONS.READ
    },
    { 
      icon: "fas fa-tags", 
      label: "Asignación de Precios", 
      href: "/asignacion-precios", 
      active: location === "/asignacion-precios",
      category: "financiero",
      module: MODULES.CONCEPTS,
      action: ACTIONS.CONFIGURE
    },
    { 
      icon: "fas fa-building", 
      label: "Proveedores", 
      href: "/proveedores", 
      active: location === "/proveedores",
      category: "administrativo",
      module: MODULES.PROVIDERS,
      action: ACTIONS.READ
    },
    { 
      icon: "fas fa-percent", 
      label: "Becas y Descuentos", 
      href: "/becas", 
      active: location === "/becas",
      category: "financiero",
      module: MODULES.SCHOLARSHIPS,
      action: ACTIONS.ASSIGN
    },
    { 
      icon: "fas fa-file-import", 
      label: "Importación de Datos", 
      href: "/importacion-datos", 
      active: location === "/importacion-datos",
      category: "sistema",
      module: MODULES.SYSTEM,
      action: ACTIONS.IMPORT
    },
    { 
      icon: "fas fa-bell", 
      label: "Notificaciones", 
      href: "/notificaciones", 
      active: location === "/notificaciones",
      category: "sistema",
      module: MODULES.SYSTEM,
      action: ACTIONS.READ
    },
    { 
      icon: "fas fa-chart-bar", 
      label: "Reportes", 
      href: "/reportes", 
      active: location === "/reportes",
      category: "sistema",
      module: MODULES.REPORTS,
      action: ACTIONS.READ
    },
    { 
      icon: "fas fa-cog", 
      label: "Configuración", 
      href: "/configuracion", 
      active: location === "/configuracion",
      category: "sistema",
      module: MODULES.SETTINGS,
      action: ACTIONS.CONFIGURE
    },
    { 
      icon: "fas fa-calendar-check", 
      label: "Configuración de Pagos", 
      href: "/configuracion-pagos", 
      active: location === "/configuracion-pagos",
      category: "sistema",
      module: MODULES.SETTINGS,
      action: ACTIONS.CONFIGURE
    },
    { 
      icon: "fas fa-brain", 
      label: "Sistemas Avanzados", 
      href: "/sistemas-avanzados", 
      active: location === "/sistemas-avanzados",
      category: "sistema",
      module: MODULES.SYSTEM,
      action: ACTIONS.READ
    },
    { 
      icon: "fas fa-shield-alt", 
      label: "Aprobaciones", 
      href: "/aprobaciones", 
      active: location === "/aprobaciones",
      category: "sistema",
      module: MODULES.SYSTEM,
      action: ACTIONS.APPROVE
    },

  ];

  // Filtrar elementos específicos para el perfil de Admisiones
  const getAdmisionesMenuItems = () => {
    const allItems = getAllMenuItems();
    
    // Elementos específicos para admisiones con etiquetas personalizadas
    const admisionesItems = [
      '/estudiantes',
      '/familias',
      '/exalumnos',
      '/crm-escolar',
      '/pagos', // Solo para inscripciones
      '/reportes-financieros', // Solo reportes de inscripciones
      '/capacitacion'
    ];
    
    return allItems.filter(item => {
      return admisionesItems.includes(item.href);
    }).map(item => {
      // Personalizar etiquetas específicas para admisiones
      if (item.href === '/pagos') {
        return {
          ...item,
          label: 'Pagos de Inscripciones',
          icon: 'fas fa-graduation-cap'
        };
      }
      if (item.href === '/reportes-financieros') {
        return {
          ...item,
          label: 'Reportes de Inscripciones',
          href: '/reportes-admisiones',
          category: 'administrativo'
        };
      }
      return item;
    });
  };

  // Filtrar elementos del menú según permisos del usuario
  const menuItems = userRole === 'admisiones' 
    ? getAdmisionesMenuItems()
    : getAllMenuItems().filter(item => {
        // Si no tiene módulo definido, mostrar por defecto
        if (!item.module || !item.action) return true;
        
        // Verificar permisos específicos para el rol
        return hasPermission(userRole, item.module, item.action);
      });

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
            {userRole === 'admisiones' && (
              <div className="mt-1 px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full text-center">
                <i className="fas fa-user-graduate mr-1"></i>
                Perfil Admisiones
              </div>
            )}
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
