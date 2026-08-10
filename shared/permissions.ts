/**
 * SISTEMA DE PERMISOS Y ROLES - EDUPAY
 * Define reglas de autorización para cada rol de usuario
 */

export type UserRole = 'super_admin' | 'administrador_general' | 'administrador_campus' | 'contador_general' | 'auxiliar_contable' | 'asistente' | 'admisiones';

/**
 * JERARQUÍA DE ROLES - Define qué roles pueden editar a otros roles
 * Un rol más alto en la jerarquía puede editar roles más bajos
 */
export const ROLE_HIERARCHY: Record<UserRole, number> = {
  'super_admin': 7,           // Máximo nivel - puede editar todos
  'administrador_general': 6, // Puede editar administrador_campus hacia abajo
  'administrador_campus': 5,  // Puede editar contador_general hacia abajo
  'contador_general': 4,      // Puede editar auxiliar_contable hacia abajo
  'auxiliar_contable': 3,     // Puede editar asistente hacia abajo
  'asistente': 2,             // Puede editar admisiones
  'admisiones': 1             // Nivel más bajo - no puede editar otros
};

/**
 * Verifica si un usuario puede editar a otro usuario basado en la jerarquía de roles
 */
export function canEditUser(editorRole: UserRole, targetRole: UserRole): boolean {
  const editorLevel = ROLE_HIERARCHY[editorRole] || 0;
  const targetLevel = ROLE_HIERARCHY[targetRole] || 0;
  
  // Solo puede editar usuarios de nivel inferior o igual (pero no del mismo nivel si es administrador)
  if (editorRole === 'administrador_campus' && targetRole === 'administrador_general') {
    return false; // Administrador de campus NO puede editar al administrador general
  }
  
  return editorLevel > targetLevel;
}

/**
 * Obtiene los roles que un usuario puede crear/editar
 */
export function getEditableRoles(userRole: UserRole): UserRole[] {
  const userLevel = ROLE_HIERARCHY[userRole] || 0;
  
  return Object.entries(ROLE_HIERARCHY)
    .filter(([role, level]) => userLevel > level)
    .map(([role]) => role as UserRole);
}

export interface Permission {
  module: string;
  action: string;
  scope: 'all' | 'campus' | 'own' | 'read_only';
  description: string;
}

export interface RolePermissions {
  role: UserRole;
  name: string;
  description: string;
  permissions: Permission[];
  restrictions: string[];
}

/**
 * DEFINICIÓN DE PERMISOS POR MÓDULO
 */
export const MODULES = {
  DASHBOARD: 'dashboard',
  STUDENTS: 'students',
  FAMILIES: 'families',
  CHARGES: 'charges',
  PAYMENTS: 'payments',
  CONCEPTS: 'concepts',
  PRODUCTS: 'products',
  SCHOLARSHIPS: 'scholarships',
  USERS: 'users',
  REPORTS: 'reports',
  SETTINGS: 'settings',
  FINANCIAL: 'financial',
  CRM: 'crm',
  PROVIDERS: 'providers',
  ALUMNI: 'alumni',
  RECEIVABLES: 'receivables',
  SECURITY: 'security',
  FISCAL: 'fiscal',
  SYSTEM: 'system'
} as const;

export const ACTIONS = {
  READ: 'read',
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  EXPORT: 'export',
  IMPORT: 'import',
  APPROVE: 'approve',
  ASSIGN: 'assign',
  PROCESS: 'process',
  CONFIGURE: 'configure'
} as const;

/**
 * DEFINICIÓN DE ROLES Y PERMISOS
 */
export const ROLE_PERMISSIONS: RolePermissions[] = [
  {
    role: 'super_admin',
    name: 'Super Administrador',
    description: 'Responsable de toda la plataforma SaaS - NO TRABAJAR HASTA COMPLETAR DASHBOARD ADMINISTRADOR GENERAL',
    permissions: [
      { module: MODULES.DASHBOARD, action: ACTIONS.READ, scope: 'all', description: 'Ver todos los dashboards de la plataforma' },
      { module: MODULES.STUDENTS, action: ACTIONS.CREATE, scope: 'all', description: 'Crear estudiantes en cualquier campus' },
      { module: MODULES.STUDENTS, action: ACTIONS.READ, scope: 'all', description: 'Ver todos los estudiantes de la plataforma' },
      { module: MODULES.STUDENTS, action: ACTIONS.UPDATE, scope: 'all', description: 'Editar cualquier estudiante' },
      { module: MODULES.STUDENTS, action: ACTIONS.DELETE, scope: 'all', description: 'Eliminar cualquier estudiante' },
      { module: MODULES.FAMILIES, action: ACTIONS.CREATE, scope: 'all', description: 'Crear familias en cualquier campus' },
      { module: MODULES.FAMILIES, action: ACTIONS.READ, scope: 'all', description: 'Ver todas las familias de la plataforma' },
      { module: MODULES.FAMILIES, action: ACTIONS.UPDATE, scope: 'all', description: 'Editar cualquier familia' },
      { module: MODULES.FAMILIES, action: ACTIONS.DELETE, scope: 'all', description: 'Eliminar cualquier familia' },
      { module: MODULES.CHARGES, action: ACTIONS.CREATE, scope: 'all', description: 'Crear cargos en cualquier campus' },
      { module: MODULES.CHARGES, action: ACTIONS.READ, scope: 'all', description: 'Ver todos los cargos' },
      { module: MODULES.CHARGES, action: ACTIONS.UPDATE, scope: 'all', description: 'Modificar cualquier cargo' },
      { module: MODULES.CHARGES, action: ACTIONS.DELETE, scope: 'all', description: 'Eliminar cualquier cargo' },
      { module: MODULES.PAYMENTS, action: ACTIONS.READ, scope: 'all', description: 'Ver todos los pagos' },
      { module: MODULES.PAYMENTS, action: ACTIONS.PROCESS, scope: 'all', description: 'Procesar pagos en cualquier campus' },
      { module: MODULES.CONCEPTS, action: ACTIONS.CONFIGURE, scope: 'all', description: 'Configurar conceptos en cualquier campus' },
      { module: MODULES.PRODUCTS, action: ACTIONS.READ,      scope: 'all', description: 'Ver catálogo de productos (precios por nivel) en cualquier campus' },
      { module: MODULES.PRODUCTS, action: ACTIONS.CONFIGURE, scope: 'all', description: 'Gestionar catálogo de productos en cualquier campus' },
      { module: MODULES.SCHOLARSHIPS, action: ACTIONS.ASSIGN, scope: 'all', description: 'Asignar becas en cualquier campus' },
      { module: MODULES.USERS, action: ACTIONS.CREATE, scope: 'all', description: 'Crear usuarios en cualquier campus' },
      { module: MODULES.USERS, action: ACTIONS.READ, scope: 'all', description: 'Ver todos los usuarios' },
      { module: MODULES.USERS, action: ACTIONS.UPDATE, scope: 'all', description: 'Editar cualquier usuario' },
      { module: MODULES.USERS, action: ACTIONS.DELETE, scope: 'all', description: 'Eliminar cualquier usuario' },
      { module: MODULES.REPORTS, action: ACTIONS.READ, scope: 'all', description: 'Ver todos los reportes' },
      { module: MODULES.REPORTS, action: ACTIONS.EXPORT, scope: 'all', description: 'Exportar cualquier reporte' },
      { module: MODULES.SETTINGS, action: ACTIONS.CONFIGURE, scope: 'all', description: 'Configurar cualquier ajuste' },
      { module: MODULES.FINANCIAL, action: ACTIONS.READ, scope: 'all', description: 'Ver análisis financiero de todas las escuelas' },
      { module: MODULES.SECURITY, action: ACTIONS.READ,      scope: 'all', description: 'Ver historial de auditoría y eventos de seguridad de la plataforma' },
      { module: MODULES.SECURITY, action: ACTIONS.CONFIGURE, scope: 'all', description: 'Configurar seguridad del sistema' },
      { module: MODULES.SYSTEM, action: ACTIONS.CONFIGURE, scope: 'all', description: 'Configurar parámetros del sistema' },
      { module: MODULES.SYSTEM, action: ACTIONS.APPROVE, scope: 'all', description: 'Aprobar solicitudes del sistema' }
    ],
    restrictions: []
  },
  {
    role: 'administrador_general',
    name: 'Administrador General',
    description: 'Administración completa del instituto con control total sobre cambios financieros',
    permissions: [
      { module: MODULES.DASHBOARD, action: ACTIONS.READ, scope: 'campus', description: 'Ver dashboard del campus' },
      { module: MODULES.STUDENTS, action: ACTIONS.CREATE, scope: 'campus', description: 'Crear estudiantes del campus' },
      { module: MODULES.STUDENTS, action: ACTIONS.READ, scope: 'campus', description: 'Ver estudiantes del campus' },
      { module: MODULES.STUDENTS, action: ACTIONS.UPDATE, scope: 'campus', description: 'Editar estudiantes del campus' },
      { module: MODULES.STUDENTS, action: ACTIONS.DELETE, scope: 'campus', description: 'Eliminar estudiantes del campus' },
      { module: MODULES.FAMILIES, action: ACTIONS.CREATE, scope: 'campus', description: 'Crear familias del campus' },
      { module: MODULES.FAMILIES, action: ACTIONS.READ, scope: 'campus', description: 'Ver familias del campus' },
      { module: MODULES.FAMILIES, action: ACTIONS.UPDATE, scope: 'campus', description: 'Editar familias del campus' },
      { module: MODULES.FAMILIES, action: ACTIONS.DELETE, scope: 'campus', description: 'Eliminar familias del campus' },
      { module: MODULES.CHARGES, action: ACTIONS.CREATE, scope: 'campus', description: 'Crear cargos del campus' },
      { module: MODULES.CHARGES, action: ACTIONS.READ, scope: 'campus', description: 'Ver cargos del campus' },
      { module: MODULES.CHARGES, action: ACTIONS.UPDATE, scope: 'campus', description: 'Modificar cargos del campus' },
      { module: MODULES.CHARGES, action: ACTIONS.DELETE, scope: 'campus', description: 'Eliminar cargos del campus' },
      { module: MODULES.PAYMENTS, action: ACTIONS.READ, scope: 'campus', description: 'Ver pagos del campus' },
      { module: MODULES.PAYMENTS, action: ACTIONS.PROCESS, scope: 'campus', description: 'Procesar pagos del campus' },
      { module: MODULES.CONCEPTS, action: ACTIONS.CONFIGURE, scope: 'campus', description: 'Configurar conceptos del campus' },
      { module: MODULES.PRODUCTS, action: ACTIONS.READ,      scope: 'campus', description: 'Ver catálogo de productos (precios por nivel) del campus' },
      { module: MODULES.PRODUCTS, action: ACTIONS.CONFIGURE, scope: 'campus', description: 'Gestionar catálogo de productos del campus' },
      { module: MODULES.SCHOLARSHIPS, action: ACTIONS.ASSIGN, scope: 'campus', description: 'Asignar becas del campus' },
      { module: MODULES.USERS, action: ACTIONS.CREATE, scope: 'campus', description: 'Crear usuarios del campus' },
      { module: MODULES.USERS, action: ACTIONS.READ, scope: 'campus', description: 'Ver usuarios del campus' },
      { module: MODULES.USERS, action: ACTIONS.UPDATE, scope: 'campus', description: 'Editar usuarios del campus' },
      { module: MODULES.USERS, action: ACTIONS.DELETE, scope: 'campus', description: 'Eliminar usuarios del campus' },
      { module: MODULES.REPORTS, action: ACTIONS.READ, scope: 'campus', description: 'Ver reportes del campus' },
      { module: MODULES.REPORTS, action: ACTIONS.EXPORT, scope: 'campus', description: 'Exportar reportes del campus' },
      { module: MODULES.SETTINGS, action: ACTIONS.CONFIGURE, scope: 'campus', description: 'Configurar ajustes del campus' },
      { module: MODULES.FINANCIAL, action: ACTIONS.READ, scope: 'campus', description: 'Ver análisis financiero del campus' },
      { module: MODULES.CRM, action: ACTIONS.READ, scope: 'campus', description: 'Ver CRM del campus' },
      { module: MODULES.CRM, action: ACTIONS.UPDATE, scope: 'campus', description: 'Gestionar CRM del campus' },
      { module: MODULES.PROVIDERS, action: ACTIONS.READ, scope: 'campus', description: 'Ver proveedores del campus' },
      { module: MODULES.PROVIDERS, action: ACTIONS.UPDATE, scope: 'campus', description: 'Gestionar proveedores del campus' },
      { module: MODULES.ALUMNI, action: ACTIONS.READ, scope: 'campus', description: 'Ver ex-alumnos del campus' },
      { module: MODULES.RECEIVABLES, action: ACTIONS.READ, scope: 'campus', description: 'Ver cuentas por cobrar del campus' },
      { module: MODULES.RECEIVABLES, action: ACTIONS.PROCESS, scope: 'campus', description: 'Procesar cobranza del campus' },
      { module: MODULES.CONCEPTS, action: ACTIONS.READ, scope: 'campus', description: 'Ver conceptos de cobro del campus' },
      { module: MODULES.PRODUCTS, action: ACTIONS.READ,      scope: 'campus', description: 'Ver catálogo de productos (precios por nivel) del campus' },
      { module: MODULES.PRODUCTS, action: ACTIONS.CONFIGURE, scope: 'campus', description: 'Gestionar catálogo de productos del campus' },
      { module: MODULES.FISCAL, action: ACTIONS.READ, scope: 'campus', description: 'Ver funcionalidad fiscal y contable' },
      { module: MODULES.SYSTEM, action: ACTIONS.READ, scope: 'campus', description: 'Ver sistemas del campus' },
      { module: MODULES.SYSTEM, action: ACTIONS.IMPORT, scope: 'campus', description: 'Importar datos del campus' },
      { module: MODULES.SYSTEM, action: ACTIONS.APPROVE, scope: 'campus', description: 'Aprobar acciones del campus' },
      { module: MODULES.SECURITY, action: ACTIONS.READ, scope: 'campus', description: 'Ver historial de auditoría del campus' }
    ],
    restrictions: [
      'Control total sobre el instituto',
      'Debe aprobar todos los cambios financieros importantes',
      'Acceso completo a información del estudiante en aprobaciones'
    ]
  },
  {
    role: 'administrador_campus',
    name: 'Administrador de Campus',
    description: 'Administración de un campus específico bajo supervisión del Administrador General',
    permissions: [
      { module: MODULES.DASHBOARD, action: ACTIONS.READ, scope: 'campus', description: 'Ver dashboard del campus' },
      { module: MODULES.STUDENTS, action: ACTIONS.CREATE, scope: 'campus', description: 'Crear estudiantes del campus' },
      { module: MODULES.STUDENTS, action: ACTIONS.READ, scope: 'campus', description: 'Ver estudiantes del campus' },
      { module: MODULES.STUDENTS, action: ACTIONS.UPDATE, scope: 'campus', description: 'Editar estudiantes del campus' },
      { module: MODULES.FAMILIES, action: ACTIONS.CREATE, scope: 'campus', description: 'Crear familias del campus' },
      { module: MODULES.FAMILIES, action: ACTIONS.READ, scope: 'campus', description: 'Ver familias del campus' },
      { module: MODULES.FAMILIES, action: ACTIONS.UPDATE, scope: 'campus', description: 'Editar familias del campus' },
      { module: MODULES.CHARGES, action: ACTIONS.CREATE, scope: 'campus', description: 'Crear cargos del campus' },
      { module: MODULES.CHARGES, action: ACTIONS.READ, scope: 'campus', description: 'Ver cargos del campus' },
      { module: MODULES.CHARGES, action: ACTIONS.UPDATE, scope: 'campus', description: 'Modificar cargos del campus' },
      { module: MODULES.PAYMENTS, action: ACTIONS.READ, scope: 'campus', description: 'Ver pagos del campus' },
      { module: MODULES.PAYMENTS, action: ACTIONS.PROCESS, scope: 'campus', description: 'Procesar pagos del campus' },
      { module: MODULES.CONCEPTS, action: ACTIONS.READ, scope: 'campus', description: 'Ver conceptos de cobro del campus' },
      { module: MODULES.CONCEPTS, action: ACTIONS.CONFIGURE, scope: 'campus', description: 'Gestionar catálogo de conceptos de cobro del campus' },
      { module: MODULES.PRODUCTS, action: ACTIONS.READ,      scope: 'campus', description: 'Ver catálogo de productos (precios por nivel) del campus' },
      { module: MODULES.PRODUCTS, action: ACTIONS.CONFIGURE, scope: 'campus', description: 'Gestionar catálogo de productos del campus' },
      { module: MODULES.SCHOLARSHIPS, action: ACTIONS.READ, scope: 'campus', description: 'Ver becas del campus' },
      { module: MODULES.SCHOLARSHIPS, action: ACTIONS.ASSIGN, scope: 'campus', description: 'Asignar becas del campus' },
      { module: MODULES.USERS, action: ACTIONS.CREATE, scope: 'campus', description: 'Crear usuarios del campus' },
      { module: MODULES.USERS, action: ACTIONS.READ, scope: 'campus', description: 'Ver usuarios del campus' },
      { module: MODULES.USERS, action: ACTIONS.UPDATE, scope: 'campus', description: 'Editar usuarios del campus' },
      { module: MODULES.USERS, action: ACTIONS.DELETE, scope: 'campus', description: 'Eliminar usuarios del campus' },
      { module: MODULES.REPORTS, action: ACTIONS.READ, scope: 'campus', description: 'Ver reportes del campus' },
      { module: MODULES.SETTINGS, action: ACTIONS.READ, scope: 'campus', description: 'Ver configuración del campus' },
      { module: MODULES.SETTINGS, action: ACTIONS.CONFIGURE, scope: 'campus', description: 'Configurar reglas de pago y recargo del campus' },
      { module: MODULES.SYSTEM, action: ACTIONS.READ, scope: 'campus', description: 'Ver sistemas del campus' },
      { module: MODULES.SECURITY, action: ACTIONS.READ, scope: 'campus', description: 'Ver historial de auditoría del campus' }
    ],
    restrictions: [
      'Cambios financieros requieren aprobación del Administrador General',
      'No puede eliminar estudiantes sin aprobación',
      'No puede crear usuarios Super Admin o Administrador General',
      'No puede editar usuarios de nivel superior (Administrador General, Super Admin)',
      'Solo puede gestionar usuarios de su campus y de nivel inferior',
      'No puede ver información de otros campus'
    ]
  },
  {
    role: 'contador_general',
    name: 'Contador General',
    description: 'Acceso completo a análisis financiero y reportes contables',
    permissions: [
      { module: MODULES.DASHBOARD, action: ACTIONS.READ, scope: 'campus', description: 'Ver dashboard financiero del campus' },
      { module: MODULES.STUDENTS, action: ACTIONS.READ, scope: 'campus', description: 'Ver estudiantes del campus' },
      { module: MODULES.FAMILIES, action: ACTIONS.READ, scope: 'campus', description: 'Ver familias del campus' },
      { module: MODULES.CHARGES, action: ACTIONS.READ, scope: 'campus', description: 'Ver todos los cargos del campus' },
      { module: MODULES.PAYMENTS, action: ACTIONS.READ, scope: 'campus', description: 'Ver todos los pagos del campus' },
      { module: MODULES.PAYMENTS, action: ACTIONS.PROCESS, scope: 'campus', description: 'Procesar pagos del campus' },
      { module: MODULES.RECEIVABLES, action: ACTIONS.READ, scope: 'campus', description: 'Ver cuentas por cobrar completas' },
      { module: MODULES.REPORTS, action: ACTIONS.READ, scope: 'campus', description: 'Ver todos los reportes financieros' },
      { module: MODULES.REPORTS, action: ACTIONS.EXPORT, scope: 'campus', description: 'Exportar todos los reportes' },
      { module: MODULES.FINANCIAL, action: ACTIONS.READ, scope: 'campus', description: 'Ver análisis financiero completo' },
      { module: MODULES.SCHOLARSHIPS, action: ACTIONS.ASSIGN, scope: 'campus', description: 'Asignar becas del campus' },
      { module: MODULES.FISCAL, action: ACTIONS.READ, scope: 'campus', description: 'Ver información fiscal completa' },
      { module: MODULES.FISCAL, action: ACTIONS.CONFIGURE, scope: 'campus', description: 'Configurar aspectos fiscales' },
      { module: MODULES.SECURITY, action: ACTIONS.READ, scope: 'campus', description: 'Ver historial de auditoría financiera del campus' }
    ],
    restrictions: [
      'No puede crear o eliminar estudiantes',
      'No puede procesar pagos directamente',
      'No puede asignar becas',
      'No puede crear usuarios',
      'Enfoque principal en análisis y reportes'
    ]
  },
  {
    role: 'auxiliar_contable',
    name: 'Auxiliar Contable',
    description: 'Soporte contable con acceso limitado a funciones financieras',
    permissions: [
      { module: MODULES.DASHBOARD, action: ACTIONS.READ, scope: 'campus', description: 'Ver dashboard básico del campus' },
      { module: MODULES.STUDENTS, action: ACTIONS.READ, scope: 'campus', description: 'Ver estudiantes del campus' },
      { module: MODULES.FAMILIES, action: ACTIONS.READ, scope: 'campus', description: 'Ver familias del campus' },
      { module: MODULES.CHARGES, action: ACTIONS.READ, scope: 'campus', description: 'Ver cargos del campus' },
      { module: MODULES.PAYMENTS, action: ACTIONS.READ, scope: 'campus', description: 'Ver pagos del campus' },
      { module: MODULES.RECEIVABLES, action: ACTIONS.READ, scope: 'campus', description: 'Ver cuentas por cobrar básicas' },
      { module: MODULES.REPORTS, action: ACTIONS.READ, scope: 'campus', description: 'Ver reportes básicos' },
      { module: MODULES.FISCAL, action: ACTIONS.READ, scope: 'campus', description: 'Ver información fiscal básica' }
    ],
    restrictions: [
      'Solo acceso de lectura a información financiera',
      'No puede exportar reportes',
      'No puede crear o eliminar información',
      'No puede procesar pagos',
      'No puede configurar aspectos fiscales',
      'Acceso limitado comparado con Contador General'
    ]
  },
  {
    role: 'admisiones',
    name: 'Admisiones',
    description: 'Gestión de estudiantes, familias y proceso de admisión',
    permissions: [
      { module: MODULES.DASHBOARD, action: ACTIONS.READ, scope: 'campus', description: 'Ver dashboard del campus' },
      { module: MODULES.STUDENTS, action: ACTIONS.CREATE, scope: 'campus', description: 'Crear estudiantes del campus' },
      { module: MODULES.STUDENTS, action: ACTIONS.READ, scope: 'campus', description: 'Ver estudiantes del campus' },
      { module: MODULES.STUDENTS, action: ACTIONS.UPDATE, scope: 'campus', description: 'Editar estudiantes del campus' },
      { module: MODULES.STUDENTS, action: ACTIONS.IMPORT, scope: 'campus', description: 'Importar estudiantes masivamente' },
      { module: MODULES.FAMILIES, action: ACTIONS.CREATE, scope: 'campus', description: 'Crear familias del campus' },
      { module: MODULES.FAMILIES, action: ACTIONS.READ, scope: 'campus', description: 'Ver familias del campus' },
      { module: MODULES.FAMILIES, action: ACTIONS.UPDATE, scope: 'campus', description: 'Editar familias del campus' },
      { module: MODULES.FAMILIES, action: ACTIONS.IMPORT, scope: 'campus', description: 'Importar familias masivamente' },
      { module: MODULES.CHARGES, action: ACTIONS.READ, scope: 'campus', description: 'Ver cargos del campus' },
      { module: MODULES.PAYMENTS, action: ACTIONS.READ, scope: 'campus', description: 'Ver pagos del campus' },
      { module: MODULES.SCHOLARSHIPS, action: ACTIONS.READ, scope: 'campus', description: 'Ver becas del campus' },
      { module: MODULES.REPORTS, action: ACTIONS.READ, scope: 'campus', description: 'Ver reportes de estudiantes' },
      { module: MODULES.REPORTS, action: ACTIONS.EXPORT, scope: 'campus', description: 'Exportar reportes de estudiantes' },
      { module: MODULES.CRM, action: ACTIONS.READ, scope: 'campus', description: 'Ver CRM del campus' },
      { module: MODULES.CRM, action: ACTIONS.UPDATE, scope: 'campus', description: 'Gestionar prospectos' },
      { module: MODULES.ALUMNI, action: ACTIONS.READ, scope: 'campus', description: 'Ver ex-alumnos del campus' },
      { module: MODULES.ALUMNI, action: ACTIONS.UPDATE, scope: 'campus', description: 'Actualizar información de ex-alumnos' }
    ],
    restrictions: [
      'No puede eliminar estudiantes o familias',
      'No puede crear o modificar cargos',
      'No puede procesar pagos',
      'No puede crear otros usuarios',
      'No puede configurar conceptos o precios',
      'No puede ver análisis financiero',
      'No puede acceder a cuentas por cobrar'
    ]
  },
  {
    role: 'asistente',
    name: 'Asistente',
    description: 'Soporte administrativo con acceso limitado',
    permissions: [
      { module: MODULES.DASHBOARD, action: ACTIONS.READ, scope: 'campus', description: 'Ver dashboard del campus' },
      { module: MODULES.STUDENTS, action: ACTIONS.READ, scope: 'campus', description: 'Ver estudiantes del campus' },
      { module: MODULES.STUDENTS, action: ACTIONS.UPDATE, scope: 'campus', description: 'Editar información básica de estudiantes' },
      { module: MODULES.FAMILIES, action: ACTIONS.READ, scope: 'campus', description: 'Ver familias del campus' },
      { module: MODULES.FAMILIES, action: ACTIONS.UPDATE, scope: 'campus', description: 'Editar información básica de familias' },
      { module: MODULES.CHARGES, action: ACTIONS.READ, scope: 'campus', description: 'Ver cargos del campus' },
      { module: MODULES.PAYMENTS, action: ACTIONS.READ, scope: 'campus', description: 'Ver pagos del campus' },
      { module: MODULES.SCHOLARSHIPS, action: ACTIONS.READ, scope: 'campus', description: 'Ver becas del campus' },
      { module: MODULES.REPORTS, action: ACTIONS.READ, scope: 'campus', description: 'Ver reportes básicos' },
      { module: MODULES.CRM, action: ACTIONS.READ, scope: 'campus', description: 'Ver CRM del campus' },
      { module: MODULES.PROVIDERS, action: ACTIONS.READ, scope: 'campus', description: 'Ver proveedores del campus' },
      { module: MODULES.ALUMNI, action: ACTIONS.READ, scope: 'campus', description: 'Ver ex-alumnos del campus' }
    ],
    restrictions: [
      'No puede crear nuevos registros',
      'No puede eliminar información',
      'No puede procesar pagos',
      'No puede asignar becas',
      'No puede crear usuarios',
      'No puede exportar reportes',
      'No puede ver análisis financiero',
      'No puede configurar conceptos',
      'No puede acceder a cuentas por cobrar'
    ]
  }
];

/**
 * ROLES ESPECIFICADOS PARA EDUPAY:
 * 1. Super Admin - Responsable de toda la plataforma SaaS (NO TRABAJAR HASTA COMPLETAR DASHBOARD ADMINISTRADOR GENERAL)
 * 2. Administrador General - Control total del instituto (Rodrigo Rodriguez Pacheco)
 * 3. Administrador de Campus - Administración de campus específico
 * 4. Contador General - Acceso completo a análisis financiero
 * 5. Auxiliar Contable - Soporte contable limitado
 * 6. Asistente - Soporte administrativo básico
 * 7. Admisiones - Gestión de estudiantes y proceso de admisión
 */

/**
 * MAPEO DE ROLES PARA COMPATIBILIDAD - REMOVIDO
 * Usamos roles directamente sin mapeo para mayor claridad
 */

/**
 * FUNCIONES PARA VERIFICAR PERMISOS
 */
export function hasPermission(
  userRole: UserRole,
  module: string,
  action: string,
  scope: 'all' | 'campus' | 'own' | 'read_only' = 'campus'
): boolean {
  // super_admin tiene acceso incondicional a cualquier módulo y acción.
  // Este chequeo va antes del lookup en ROLE_PERMISSIONS para que nunca
  // dependa de que la entrada esté explícitamente listada en el array.
  if (userRole === 'super_admin') return true;

  const rolePermissions = ROLE_PERMISSIONS.find(r => r.role === userRole);
  if (!rolePermissions) return false;

  const permission = rolePermissions.permissions.find(
    p => p.module === module && p.action === action
  );

  if (!permission) return false;

  // Verificar scope
  switch (scope) {
    case 'all':
      return permission.scope === 'all';
    case 'campus':
      return permission.scope === 'all' || permission.scope === 'campus';
    case 'own':
      return permission.scope === 'all' || permission.scope === 'campus' || permission.scope === 'own';
    case 'read_only':
      return true; // Todos los roles tienen al menos lectura en su scope
    default:
      return false;
  }
}

export function getRolePermissions(userRole: UserRole): RolePermissions | undefined {
  return ROLE_PERMISSIONS.find(r => r.role === userRole);
}

export function getAllRoles(): RolePermissions[] {
  return ROLE_PERMISSIONS;
}

export function canAccessModule(userRole: UserRole, module: string): boolean {
  const rolePermissions = ROLE_PERMISSIONS.find(r => r.role === userRole);
  if (!rolePermissions) return false;

  return rolePermissions.permissions.some(p => p.module === module);
}

export function getRestrictionsForRole(userRole: UserRole): string[] {
  const rolePermissions = ROLE_PERMISSIONS.find(r => r.role === userRole);
  return rolePermissions?.restrictions || [];
}

/**
 * FUNCIÓN HELPER PARA OBTENER NOMBRE Y DESCRIPCIÓN DEL ROL
 */
export function getRoleDisplayInfo(userRole: UserRole): { name: string; description: string } {
  const rolePermissions = ROLE_PERMISSIONS.find(r => r.role === userRole);
  return {
    name: rolePermissions?.name || 'Rol desconocido',
    description: rolePermissions?.description || 'Sin descripción'
  };
}