// Sistema de roles y permisos unificado
export const USER_ROLES = {
  ADMINISTRADOR_GENERAL: 'administrador_general',
  ADMINISTRADOR_CAMPUS: 'administrador_campus', 
  CONTADOR_GENERAL: 'contador_general',
  AUXILIAR_CONTABLE: 'auxiliar_contable',
  ASISTENTE: 'asistente',
  ADMISIONES: 'admisiones'
} as const;

export type UserRole = typeof USER_ROLES[keyof typeof USER_ROLES];

// Permisos disponibles en el sistema
export const PERMISSIONS = {
  // Gestión de usuarios
  'users.create': 'Crear usuarios',
  'users.read': 'Ver usuarios',
  'users.update': 'Editar usuarios',
  'users.delete': 'Eliminar usuarios',
  'users.manage_permissions': 'Gestionar permisos de usuarios',

  // Gestión de estudiantes
  'students.create': 'Crear estudiantes',
  'students.read': 'Ver estudiantes',
  'students.update': 'Editar estudiantes',
  'students.delete': 'Eliminar estudiantes',
  'students.import': 'Importar estudiantes',

  // Gestión de familias
  'families.create': 'Crear familias',
  'families.read': 'Ver familias',
  'families.update': 'Editar familias',
  'families.delete': 'Eliminar familias',

  // Gestión financiera
  'charges.create': 'Crear cargos',
  'charges.read': 'Ver cargos',
  'charges.update': 'Editar cargos',
  'charges.delete': 'Eliminar cargos',
  'charges.bulk_create': 'Crear cargos masivos',

  // Pagos
  'payments.create': 'Registrar pagos',
  'payments.read': 'Ver pagos',
  'payments.update': 'Editar pagos',
  'payments.delete': 'Eliminar pagos',
  'payments.process': 'Procesar pagos',

  // Reportes
  'reports.financial': 'Ver reportes financieros',
  'reports.academic': 'Ver reportes académicos',
  'reports.administrative': 'Ver reportes administrativos',
  'reports.export': 'Exportar reportes',

  // Configuración
  'settings.general': 'Configuración general',
  'settings.institution': 'Configuración institucional',
  'settings.payments': 'Configuración de pagos',
  'settings.fiscal': 'Configuración fiscal',
  'settings.security': 'Configuración de seguridad',

  // Becas y descuentos
  'scholarships.create': 'Crear becas',
  'scholarships.read': 'Ver becas',
  'scholarships.update': 'Editar becas',
  'scholarships.delete': 'Eliminar becas',

  // Cuentas por cobrar
  'receivables.read': 'Ver cuentas por cobrar',
  'receivables.update': 'Actualizar cuentas por cobrar',

  // Conceptos/Catálogo
  'concepts.create': 'Crear conceptos',
  'concepts.read': 'Ver conceptos',
  'concepts.update': 'Editar conceptos',
  'concepts.delete': 'Eliminar conceptos',

  // Fiscal
  'fiscal.read': 'Ver información fiscal',
  'fiscal.manage': 'Gestionar aspectos fiscales',

  // Admisiones
  'admissions.create': 'Crear inscripciones',
  'admissions.read': 'Ver inscripciones',
  'admissions.update': 'Editar inscripciones',
  'admissions.process': 'Procesar inscripciones',

  // Dashboard
  'dashboard.read': 'Ver dashboard',
  'dashboard.advanced': 'Ver dashboard avanzado',

  // Migración
  'migration.access': 'Acceso a migración',
  'migration.execute': 'Ejecutar migración',

  // Credenciales institucionales
  'credentials.read': 'Ver credenciales institucionales',
  'credentials.manage': 'Gestionar credenciales institucionales',

  // Notificaciones
  'notifications.read': 'Ver notificaciones',
  'notifications.manage': 'Gestionar notificaciones'
} as const;

// Permisos por defecto para cada rol
export const DEFAULT_ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  [USER_ROLES.ADMINISTRADOR_GENERAL]: [
    // Acceso completo a todo
    ...Object.keys(PERMISSIONS)
  ],

  [USER_ROLES.ADMINISTRADOR_CAMPUS]: [
    // Gestión completa del campus
    'users.create', 'users.read', 'users.update',
    'students.create', 'students.read', 'students.update', 'students.import',
    'families.create', 'families.read', 'families.update',
    'charges.create', 'charges.read', 'charges.update', 'charges.bulk_create',
    'payments.create', 'payments.read', 'payments.update', 'payments.process',
    'reports.financial', 'reports.academic', 'reports.administrative', 'reports.export',
    'settings.institution', 'settings.payments',
    'scholarships.create', 'scholarships.read', 'scholarships.update',
    'receivables.read', 'receivables.update',
    'concepts.create', 'concepts.read', 'concepts.update',
    'admissions.create', 'admissions.read', 'admissions.update', 'admissions.process',
    'dashboard.read', 'dashboard.advanced',
    'credentials.read', 'credentials.manage',
    'notifications.read', 'notifications.manage'
  ],

  [USER_ROLES.CONTADOR_GENERAL]: [
    // Enfoque en aspectos financieros y fiscales
    'charges.read', 'charges.update',
    'payments.read', 'payments.update',
    'reports.financial', 'reports.export',
    'receivables.read', 'receivables.update',
    'concepts.read',
    'fiscal.read', 'fiscal.manage',
    'dashboard.read',
    'students.read', 'families.read',
    'scholarships.read'
  ],

  [USER_ROLES.AUXILIAR_CONTABLE]: [
    // Apoyo en tareas contables básicas
    'charges.read',
    'payments.create', 'payments.read', 'payments.update',
    'reports.financial',
    'receivables.read',
    'concepts.read',
    'dashboard.read',
    'students.read', 'families.read',
    'scholarships.read'
  ],

  [USER_ROLES.ASISTENTE]: [
    // Tareas administrativas básicas
    'students.create', 'students.read', 'students.update',
    'families.create', 'families.read', 'families.update',
    'charges.read',
    'payments.read',
    'reports.academic',
    'dashboard.read',
    'admissions.read'
  ],

  [USER_ROLES.ADMISIONES]: [
    // Enfoque específico en proceso de admisiones
    'students.create', 'students.read', 'students.update',
    'families.create', 'families.read', 'families.update',
    'admissions.create', 'admissions.read', 'admissions.update', 'admissions.process',
    'charges.read',
    'payments.read',
    'reports.academic',
    'dashboard.read'
  ]
};

// Función para obtener permisos de un usuario
export function getUserPermissions(role: UserRole, customPermissions: string[] = []): string[] {
  const defaultPermissions = DEFAULT_ROLE_PERMISSIONS[role] || [];
  return Array.from(new Set([...defaultPermissions, ...customPermissions]));
}

// Función para verificar si un usuario tiene un permiso específico
export function hasPermission(role: UserRole, permission: string, customPermissions: string[] = []): boolean {
  const userPermissions = getUserPermissions(role, customPermissions);
  return userPermissions.includes(permission);
}

// Función para obtener el nombre legible del rol
export function getRoleDisplayName(role: UserRole): string {
  const roleNames = {
    [USER_ROLES.ADMINISTRADOR_GENERAL]: 'Administrador General',
    [USER_ROLES.ADMINISTRADOR_CAMPUS]: 'Administrador de Campus',
    [USER_ROLES.CONTADOR_GENERAL]: 'Contador General',
    [USER_ROLES.AUXILIAR_CONTABLE]: 'Auxiliar Contable',
    [USER_ROLES.ASISTENTE]: 'Asistente',
    [USER_ROLES.ADMISIONES]: 'Admisiones'
  };
  return roleNames[role] || role;
}

// Función para obtener la descripción del rol
export function getRoleDescription(role: UserRole): string {
  const descriptions = {
    [USER_ROLES.ADMINISTRADOR_GENERAL]: 'Acceso completo al sistema con capacidad de gestionar todos los aspectos y asignar permisos personalizados',
    [USER_ROLES.ADMINISTRADOR_CAMPUS]: 'Gestión completa del campus incluyendo usuarios, estudiantes, finanzas y configuración',
    [USER_ROLES.CONTADOR_GENERAL]: 'Enfoque en gestión financiera, fiscal y reportes contables del sistema',
    [USER_ROLES.AUXILIAR_CONTABLE]: 'Apoyo en tareas contables básicas como registro de pagos y consulta de información financiera',
    [USER_ROLES.ASISTENTE]: 'Tareas administrativas básicas de estudiantes, familias y apoyo general',
    [USER_ROLES.ADMISIONES]: 'Especializado en el proceso de admisiones e inscripciones de nuevos estudiantes'
  };
  return descriptions[role] || '';
}