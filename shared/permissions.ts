/**
 * SISTEMA DE PERMISOS Y ROLES - EDUPAY
 * Define reglas de autorización para cada rol de usuario
 */

export type UserRole = 'super_admin' | 'admin' | 'caja' | 'contador' | 'admisiones' | 'asistente' | 'support' | 'implementation';

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
    description: 'Acceso completo a toda la plataforma SaaS',
    permissions: [
      { module: MODULES.DASHBOARD, action: ACTIONS.READ, scope: 'all', description: 'Ver todos los dashboards' },
      { module: MODULES.STUDENTS, action: ACTIONS.CREATE, scope: 'all', description: 'Crear estudiantes en cualquier campus' },
      { module: MODULES.STUDENTS, action: ACTIONS.READ, scope: 'all', description: 'Ver todos los estudiantes' },
      { module: MODULES.STUDENTS, action: ACTIONS.UPDATE, scope: 'all', description: 'Editar cualquier estudiante' },
      { module: MODULES.STUDENTS, action: ACTIONS.DELETE, scope: 'all', description: 'Eliminar cualquier estudiante' },
      { module: MODULES.FAMILIES, action: ACTIONS.CREATE, scope: 'all', description: 'Crear familias en cualquier campus' },
      { module: MODULES.FAMILIES, action: ACTIONS.READ, scope: 'all', description: 'Ver todas las familias' },
      { module: MODULES.FAMILIES, action: ACTIONS.UPDATE, scope: 'all', description: 'Editar cualquier familia' },
      { module: MODULES.FAMILIES, action: ACTIONS.DELETE, scope: 'all', description: 'Eliminar cualquier familia' },
      { module: MODULES.CHARGES, action: ACTIONS.CREATE, scope: 'all', description: 'Crear cargos en cualquier campus' },
      { module: MODULES.CHARGES, action: ACTIONS.READ, scope: 'all', description: 'Ver todos los cargos' },
      { module: MODULES.CHARGES, action: ACTIONS.UPDATE, scope: 'all', description: 'Modificar cualquier cargo' },
      { module: MODULES.CHARGES, action: ACTIONS.DELETE, scope: 'all', description: 'Eliminar cualquier cargo' },
      { module: MODULES.PAYMENTS, action: ACTIONS.READ, scope: 'all', description: 'Ver todos los pagos' },
      { module: MODULES.PAYMENTS, action: ACTIONS.PROCESS, scope: 'all', description: 'Procesar pagos en cualquier campus' },
      { module: MODULES.CONCEPTS, action: ACTIONS.CONFIGURE, scope: 'all', description: 'Configurar conceptos en cualquier campus' },
      { module: MODULES.SCHOLARSHIPS, action: ACTIONS.ASSIGN, scope: 'all', description: 'Asignar becas en cualquier campus' },
      { module: MODULES.USERS, action: ACTIONS.CREATE, scope: 'all', description: 'Crear usuarios en cualquier campus' },
      { module: MODULES.USERS, action: ACTIONS.READ, scope: 'all', description: 'Ver todos los usuarios' },
      { module: MODULES.USERS, action: ACTIONS.UPDATE, scope: 'all', description: 'Editar cualquier usuario' },
      { module: MODULES.USERS, action: ACTIONS.DELETE, scope: 'all', description: 'Eliminar cualquier usuario' },
      { module: MODULES.REPORTS, action: ACTIONS.READ, scope: 'all', description: 'Ver todos los reportes' },
      { module: MODULES.REPORTS, action: ACTIONS.EXPORT, scope: 'all', description: 'Exportar cualquier reporte' },
      { module: MODULES.SETTINGS, action: ACTIONS.CONFIGURE, scope: 'all', description: 'Configurar cualquier ajuste' },
      { module: MODULES.FINANCIAL, action: ACTIONS.READ, scope: 'all', description: 'Ver análisis financiero de todas las escuelas' },
      { module: MODULES.SECURITY, action: ACTIONS.CONFIGURE, scope: 'all', description: 'Configurar seguridad del sistema' },
      { module: MODULES.SYSTEM, action: ACTIONS.CONFIGURE, scope: 'all', description: 'Configurar parámetros del sistema' }
    ],
    restrictions: []
  },
  {
    role: 'admin',
    name: 'Administrador de Campus',
    description: 'Administración completa de un campus específico',
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
      { module: MODULES.SCHOLARSHIPS, action: ACTIONS.ASSIGN, scope: 'campus', description: 'Asignar becas del campus' },
      { module: MODULES.USERS, action: ACTIONS.CREATE, scope: 'campus', description: 'Crear usuarios del campus' },
      { module: MODULES.USERS, action: ACTIONS.READ, scope: 'campus', description: 'Ver usuarios del campus' },
      { module: MODULES.USERS, action: ACTIONS.UPDATE, scope: 'campus', description: 'Editar usuarios del campus' },
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
      { module: MODULES.CONCEPTS, action: ACTIONS.READ, scope: 'campus', description: 'Ver catálogo de productos del campus' },
      { module: MODULES.FISCAL, action: ACTIONS.READ, scope: 'campus', description: 'Ver funcionalidad fiscal y contable' },
      { module: MODULES.SYSTEM, action: ACTIONS.READ, scope: 'campus', description: 'Ver sistemas del campus' },
      { module: MODULES.SYSTEM, action: ACTIONS.IMPORT, scope: 'campus', description: 'Importar datos del campus' },
      { module: MODULES.SYSTEM, action: ACTIONS.APPROVE, scope: 'campus', description: 'Aprobar acciones del campus' }
    ],
    restrictions: [
      'No puede ver información de otros campus',
      'No puede crear usuarios Super Admin',
      'No puede modificar configuraciones globales del sistema',
      'No puede acceder a funciones de seguridad del sistema'
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
      { module: MODULES.SCHOLARSHIPS, action: ACTIONS.ASSIGN, scope: 'campus', description: 'Asignar becas del campus' },
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
  },
  {
    role: 'caja',
    name: 'Caja',
    description: 'Procesamiento de pagos y gestión financiera',
    permissions: [
      { module: MODULES.DASHBOARD, action: ACTIONS.READ, scope: 'campus', description: 'Ver dashboard del campus' },
      { module: MODULES.STUDENTS, action: ACTIONS.READ, scope: 'campus', description: 'Ver estudiantes del campus' },
      { module: MODULES.FAMILIES, action: ACTIONS.READ, scope: 'campus', description: 'Ver familias del campus' },
      { module: MODULES.CHARGES, action: ACTIONS.READ, scope: 'campus', description: 'Ver cargos del campus' },
      { module: MODULES.CHARGES, action: ACTIONS.UPDATE, scope: 'campus', description: 'Modificar estado de cargos' },
      { module: MODULES.PAYMENTS, action: ACTIONS.READ, scope: 'campus', description: 'Ver pagos del campus' },
      { module: MODULES.PAYMENTS, action: ACTIONS.PROCESS, scope: 'campus', description: 'Procesar pagos del campus' },
      { module: MODULES.PAYMENTS, action: ACTIONS.CREATE, scope: 'campus', description: 'Registrar pagos manuales' },
      { module: MODULES.RECEIVABLES, action: ACTIONS.READ, scope: 'campus', description: 'Ver cuentas por cobrar del campus' },
      { module: MODULES.RECEIVABLES, action: ACTIONS.PROCESS, scope: 'campus', description: 'Procesar cobranza del campus' },
      { module: MODULES.REPORTS, action: ACTIONS.READ, scope: 'campus', description: 'Ver reportes financieros' },
      { module: MODULES.REPORTS, action: ACTIONS.EXPORT, scope: 'campus', description: 'Exportar reportes financieros' },
      { module: MODULES.FISCAL, action: ACTIONS.READ, scope: 'campus', description: 'Ver funcionalidad fiscal y contable' }
    ],
    restrictions: [
      'No puede crear o eliminar estudiantes/familias',
      'No puede crear cargos',
      'No puede asignar becas',
      'No puede crear usuarios',
      'No puede configurar conceptos',
      'No puede ver análisis financiero avanzado',
      'No puede acceder a CRM o proveedores'
    ]
  },
  {
    role: 'contador',
    name: 'Contador',
    description: 'Acceso de solo lectura para reportes y análisis',
    permissions: [
      { module: MODULES.DASHBOARD, action: ACTIONS.READ, scope: 'campus', description: 'Ver dashboard del campus' },
      { module: MODULES.STUDENTS, action: ACTIONS.READ, scope: 'campus', description: 'Ver estudiantes del campus' },
      { module: MODULES.FAMILIES, action: ACTIONS.READ, scope: 'campus', description: 'Ver familias del campus' },
      { module: MODULES.CHARGES, action: ACTIONS.READ, scope: 'campus', description: 'Ver cargos del campus' },
      { module: MODULES.PAYMENTS, action: ACTIONS.READ, scope: 'campus', description: 'Ver pagos del campus' },
      { module: MODULES.RECEIVABLES, action: ACTIONS.READ, scope: 'campus', description: 'Ver cuentas por cobrar del campus' },
      { module: MODULES.REPORTS, action: ACTIONS.READ, scope: 'campus', description: 'Ver todos los reportes' },
      { module: MODULES.REPORTS, action: ACTIONS.EXPORT, scope: 'campus', description: 'Exportar todos los reportes' },
      { module: MODULES.FINANCIAL, action: ACTIONS.READ, scope: 'campus', description: 'Ver análisis financiero del campus' },
      { module: MODULES.FISCAL, action: ACTIONS.READ, scope: 'campus', description: 'Ver funcionalidad fiscal y contable' }
    ],
    restrictions: [
      'Solo acceso de lectura',
      'No puede crear, modificar o eliminar información',
      'No puede procesar pagos',
      'No puede asignar becas',
      'No puede crear usuarios',
      'No puede configurar conceptos',
      'No puede acceder a CRM o proveedores'
    ]
  }
];

/**
 * FUNCIONES PARA VERIFICAR PERMISOS
 */
export function hasPermission(
  userRole: UserRole,
  module: string,
  action: string,
  scope: 'all' | 'campus' | 'own' | 'read_only' = 'campus'
): boolean {
  const rolePermissions = ROLE_PERMISSIONS.find(r => r.role === userRole);
  if (!rolePermissions) return false;

  const permission = rolePermissions.permissions.find(
    p => p.module === module && p.action === action
  );

  if (!permission) return false;

  // Super admin tiene acceso completo
  if (userRole === 'super_admin') return true;

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