import { useMemo } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { UserRole, hasPermission, MODULES, ACTIONS } from '@shared/permissions';

/**
 * Hook personalizado para filtrar datos según el rol del usuario
 * Asegura que cada usuario solo vea información relevante a sus permisos
 */
export function useRoleBasedData() {
  const { user } = useAuth();
  
  const userRole = user?.role as UserRole || 'asistente';
  
  // Definir qué tipos de pagos/conceptos puede ver cada rol
  const allowedPaymentTypes = useMemo(() => {
    switch (userRole) {
      case 'super_admin':
      case 'admin':
        return ['all']; // Puede ver todos los tipos
      
      case 'admisiones':
        return ['inscripcion', 'inscription', 'reinscripcion', 'examen_admision', 'uniforme', 'libros', 'materiales'];
      
      case 'caja':
        return ['colegiatura', 'mensualidad', 'inscripcion', 'recargo', 'multa', 'seguro', 'transporte'];
      
      case 'contador':
        return ['all']; // Puede ver todos para reportes
      
      case 'asistente':
        return ['colegiatura', 'inscripcion']; // Solo lo básico
      
      default:
        return ['colegiatura'];
    }
  }, [userRole]);

  // Definir qué métricas del dashboard puede ver cada rol
  const allowedDashboardMetrics = useMemo(() => {
    switch (userRole) {
      case 'super_admin':
      case 'admin':
        return {
          totalStudents: true,
          totalRevenue: true,
          pendingPayments: true,
          paymentRate: true,
          overdueAmount: true,
          scholarships: true,
          newEnrollments: true,
          financialAnalysis: true,
          receivables: true,
          cashFlow: true
        };
      
      case 'admisiones':
        return {
          totalStudents: true,
          newEnrollments: true,
          scholarships: true,
          enrollmentRevenue: true, // Solo ingresos por inscripciones
          pendingEnrollments: true,
          totalRevenue: false,
          pendingPayments: false,
          paymentRate: false,
          overdueAmount: false,
          financialAnalysis: false,
          receivables: false,
          cashFlow: false
        };
      
      case 'caja':
        return {
          totalStudents: true,
          totalRevenue: true,
          pendingPayments: true,
          paymentRate: true,
          overdueAmount: true,
          receivables: true,
          cashFlow: true,
          dailyPayments: true,
          newEnrollments: false,
          scholarships: false,
          financialAnalysis: false
        };
      
      case 'contador':
        return {
          totalStudents: true,
          totalRevenue: true,
          pendingPayments: true,
          paymentRate: true,
          overdueAmount: true,
          scholarships: true,
          newEnrollments: true,
          financialAnalysis: true,
          receivables: true,
          cashFlow: true,
          taxReports: true
        };
      
      case 'asistente':
        return {
          totalStudents: true,
          newEnrollments: true,
          basicPayments: true,
          totalRevenue: false,
          pendingPayments: false,
          paymentRate: false,
          overdueAmount: false,
          scholarships: false,
          financialAnalysis: false,
          receivables: false,
          cashFlow: false
        };
      
      default:
        return {
          totalStudents: true,
          basicPayments: true
        };
    }
  }, [userRole]);

  // Filtrar datos de pagos basado en el rol
  const filterPaymentData = useMemo(() => {
    return (payments: any[]) => {
      if (!payments || payments.length === 0) return [];
      
      if (allowedPaymentTypes.includes('all')) {
        return payments;
      }
      
      return payments.filter(payment => {
        const conceptName = payment.charge?.concept?.nombre?.toLowerCase() || '';
        const conceptType = payment.charge?.concept?.tipo?.toLowerCase() || '';
        
        return allowedPaymentTypes.some(type => 
          conceptName.includes(type) || conceptType.includes(type)
        );
      });
    };
  }, [allowedPaymentTypes]);

  // Filtrar datos de cargos basado en el rol
  const filterChargesData = useMemo(() => {
    return (charges: any[]) => {
      if (!charges || charges.length === 0) return [];
      
      if (allowedPaymentTypes.includes('all')) {
        return charges;
      }
      
      return charges.filter(charge => {
        const conceptName = charge.concept?.nombre?.toLowerCase() || '';
        const conceptType = charge.concept?.tipo?.toLowerCase() || '';
        
        return allowedPaymentTypes.some(type => 
          conceptName.includes(type) || conceptType.includes(type)
        );
      });
    };
  }, [allowedPaymentTypes]);

  // Filtrar reportes según el rol
  const filterReportsData = useMemo(() => {
    return (reports: any[]) => {
      if (!reports || reports.length === 0) return [];
      
      switch (userRole) {
        case 'super_admin':
        case 'admin':
        case 'contador':
          return reports; // Todos los reportes
        
        case 'admisiones':
          return reports.filter(report => 
            ['student', 'enrollment', 'scholarship'].includes(report.type)
          );
        
        case 'caja':
          return reports.filter(report => 
            ['payment', 'receivable', 'cashflow'].includes(report.type)
          );
        
        case 'asistente':
          return reports.filter(report => 
            ['basic', 'student'].includes(report.type)
          );
        
        default:
          return [];
      }
    };
  }, [userRole]);

  // Verificar si el usuario puede ver una métrica específica
  const canViewMetric = useMemo(() => {
    return (metric: string) => {
      return allowedDashboardMetrics[metric as keyof typeof allowedDashboardMetrics] === true;
    };
  }, [allowedDashboardMetrics]);

  // Obtener título personalizado para el dashboard según el rol
  const getDashboardTitle = useMemo(() => {
    switch (userRole) {
      case 'super_admin':
        return 'Panel de Control - Super Administrador';
      case 'admin':
        return 'Panel de Control - Administrador';
      case 'admisiones':
        return 'Panel de Control - Admisiones';
      case 'caja':
        return 'Panel de Control - Caja y Pagos';
      case 'contador':
        return 'Panel de Control - Contador';
      case 'asistente':
        return 'Panel de Control - Asistente';
      default:
        return 'Panel de Control';
    }
  }, [userRole]);

  // Obtener descripción personalizada para el dashboard según el rol
  const getDashboardDescription = useMemo(() => {
    switch (userRole) {
      case 'super_admin':
        return 'Supervisión completa de la plataforma SaaS';
      case 'admin':
        return 'Gestión integral del campus educativo';
      case 'admisiones':
        return 'Gestión de estudiantes, inscripciones y proceso de admisión';
      case 'caja':
        return 'Procesamiento de pagos y gestión de cobranza';
      case 'contador':
        return 'Análisis financiero y reportes contables';
      case 'asistente':
        return 'Soporte administrativo y consultas básicas';
      default:
        return 'Sistema de gestión escolar';
    }
  }, [userRole]);

  return {
    userRole,
    allowedPaymentTypes,
    allowedDashboardMetrics,
    filterPaymentData,
    filterChargesData,
    filterReportsData,
    canViewMetric,
    getDashboardTitle,
    getDashboardDescription,
    // Funciones de permisos adicionales
    canCreate: (module: string) => hasPermission(userRole, module, ACTIONS.CREATE),
    canUpdate: (module: string) => hasPermission(userRole, module, ACTIONS.UPDATE),
    canDelete: (module: string) => hasPermission(userRole, module, ACTIONS.DELETE),
    canExport: (module: string) => hasPermission(userRole, module, ACTIONS.EXPORT),
    canProcess: (module: string) => hasPermission(userRole, module, ACTIONS.PROCESS),
    canView: (module: string) => hasPermission(userRole, module, ACTIONS.READ)
  };
}