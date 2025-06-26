# EscuelaPay - Plataforma SaaS de Pagos Escolares

## Overview

EscuelaPay es una plataforma SaaS 100% enfocada en automatizar los pagos de colegiaturas para escuelas particulares. No es un ERP general ni LMS; está diseñado específicamente para reducir la carga operativa y la morosidad en las escuelas.

**Principales dolores que resuelve:**
- Pagar colegiaturas es tedioso para papás → pago 1 clic
- Gestión manual de morosos es lenta → automatización de cobros  
- Caja y contabilidad no cuadran → conciliación automática
- Facturación fiscal (CFDI) es lenta → integración directa con SAT/PAC

**Meta de uso ideal:** El colegio debería poder funcionar sin papel, sin llamadas de cobranza manuales y con una tasa de pagos antes del vencimiento superior al 80%.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter for lightweight client-side routing
- **State Management**: TanStack Query (React Query) for server state management
- **UI Framework**: Tailwind CSS with Shadcn/ui component library
- **Build Tool**: Vite for fast development and optimized production builds
- **Mobile-First Design**: Responsive design optimized for mobile devices

### Backend Architecture
- **Runtime**: Node.js with Express.js
- **Language**: TypeScript with ES modules
- **Authentication**: JWT-based authentication with bcrypt password hashing
- **API Design**: RESTful API with role-based access control
- **Multi-tenancy**: Support for multiple schools with campus-level isolation

### Database Architecture
- **ORM**: Drizzle ORM with PostgreSQL
- **Database**: PostgreSQL (configured for Neon Database)
- **Schema**: Multi-tenant architecture with tenants, campuses, users, students, and financial entities
- **Migrations**: Drizzle Kit for database schema management

## Key Components

### Usuarios y Roles (5 roles específicos)
- **Super Admin (grupo de escuelas)**: Ve KPIs y controla múltiples campus
- **Admin de campus**: Configura conceptos, controla alumnos, gestiona caja
- **Finanzas/Caja**: Captura pagos manuales y cuadra bancos
- **Padre/madre/tutor (responsable de pago)**: Consulta estado de cuenta y paga en línea
- **Contador externo (read-only)**: Accede a reportes fiscales y conciliación

### Multi-Tenant Architecture
- **Tenants**: Top-level organizations (school groups)
- **Campuses**: Individual school locations within tenant organizations
- **Data Isolation**: Complete data separation between different school systems
- **Scalable Design**: Supports growth from single schools to large educational groups

### Student & Guardian Management
- **Student Profiles**: Complete student information with CURP integration
- **Guardian Relationships**: Flexible parent-student associations
- **Academic Tracking**: Grade and group management
- **Status Management**: Active, inactive, suspended, and graduated student states

### Módulos y Funciones (5 módulos principales)
1. **Configuración inicial**: Registro escuela, importación alumnos, conceptos de pago, calendario vencimientos, becas, pasarela pagos, integración PAC
2. **Emisión de cargos**: Generación automática mensual/anual, cargos extraordinarios, recargos por mora, facturas electrónicas, pagos parciales
3. **Portal del padre/tutor**: Dashboard resumen, listado conceptos, "Pagar ahora", métodos pago recurrente, histórico facturas, notificaciones automáticas
4. **Caja y conciliación**: Pagos efectivo, control bancarios, conciliación automática, reportes morosidad, dashboard KPIs
5. **Fiscal y contable**: CFDI 4.0 automático, integración contadores y PAC, reporte mensual SAT, bitácora cancelaciones

### Notification System
- **Payment Reminders**: Automated notifications for pending payments
- **Overdue Alerts**: Escalating notification system for late payments
- **Status Updates**: Real-time payment confirmations and receipt delivery

## Data Flow

1. **User Authentication**: JWT-based login with role verification
2. **Data Retrieval**: TanStack Query manages API calls with caching and background updates
3. **Multi-Tenant Context**: All operations scoped to user's campus/tenant
4. **Payment Processing**: Secure payment flow with immediate charge status updates
5. **Real-Time Updates**: Optimistic updates with automatic cache invalidation

## External Dependencies

### Tecnología Específica (según documento)
- **Frontend**: React + Tailwind CSS (PWA ready)
- **Backend**: Node.js + PostgreSQL (control transaccional estricto) + Redis (colas notificaciones)
- **Pagos**: Stripe, Openpay, Conekta, Evo Payment
- **CFDI**: PAC Facturama / Enlace Fiscal para timbrado
- **Seguridad**: PCI DSS para pagos, AES-256 en BD, 2FA para admins

### UI Dependencies
- **@radix-ui/***: Accessible UI primitives
- **tailwindcss**: Utility-first CSS framework
- **class-variance-authority**: Component variant management
- **lucide-react**: Icon library

### Payment Integration
- **Stripe**: Credit card processing (configured but not fully implemented)
- **CFDI PAC**: Mexican tax compliance system integration

## Deployment Strategy

### Development Environment
- **Replit Integration**: Optimized for Replit development environment
- **Hot Reload**: Vite development server with fast refresh
- **Database**: Neon Database serverless PostgreSQL
- **Environment Variables**: Secure configuration management

### Production Deployment
- **Build Process**: Vite for frontend, esbuild for backend bundling
- **Database Migrations**: Automated schema deployment with Drizzle
- **Static Assets**: Optimized asset delivery
- **Security**: Environment-based configuration with secure defaults

### Infrastructure Requirements
- **Node.js 20+**: Modern JavaScript runtime
- **PostgreSQL 16**: Database server
- **SSL/TLS**: Secure connection requirements
- **CDN**: Asset delivery optimization

## Changelog

Changelog:
- June 26, 2025: FUNCIONALIDAD REAL DE APLICAR CARGOS OPERATIVA - Sistema crea registros reales en base de datos
- June 26, 2025: Error 401/500 resuelto - autenticación JWT corregida para usar campus_id válido del usuario
- June 26, 2025: Cargos reales aplicados con precios diferenciados por nivel académico (Kinder/Primaria)
- June 26, 2025: ASIGNACIÓN AUTOMÁTICA DE PRECIOS POR NIVEL ACADÉMICO COMPLETADA
- June 26, 2025: Sistema de mapeo automático de grados escolares a niveles académicos (shared/academic-levels.ts)
- June 26, 2025: Página dedicada de demostración en /asignacion-precios con funcionalidad completa
- June 26, 2025: Algoritmo inteligente que detecta nivel académico desde cualquier formato de grado
- June 26, 2025: Vista previa automática mostrando cómo se asignan precios específicos a cada estudiante
- June 26, 2025: Resumen por niveles con totales calculados automáticamente
- June 26, 2025: Integración en emisión de cargos con pestaña "Desde catálogo"
- June 26, 2025: PRECIOS DIFERENCIADOS POR NIVEL ACADÉMICO IMPLEMENTADOS EN CATÁLOGO DE PRODUCTOS
- June 26, 2025: Sistema completo de precios específicos para Kinder, Primaria, Secundaria y Bachillerato
- June 26, 2025: Formulario de productos actualizado con campos individuales para cada nivel académico
- June 26, 2025: Filtro de visualización por nivel para ver precios específicos o todos los niveles
- June 26, 2025: Interfaz adaptativa que muestra precios individuales por nivel o vista completa
- June 26, 2025: Funcionalidad de guardado y edición de productos con estructura de precios por nivel
- June 26, 2025: MODALES DE CONFIRMACIÓN ROJOS COMPLETADOS CON ACCESIBILIDAD
- June 26, 2025: DialogDescription agregado a todos los modales de eliminación para cumplir estándares de accesibilidad
- June 26, 2025: Modales personalizados rojos reemplazan completamente window.confirm() en toda la plataforma
- June 26, 2025: Iconos de advertencia triangular y colores rojos consistentes en botones de eliminación
- June 26, 2025: Validaciones específicas para eliminación (ej: estudiantes con saldos pendientes)
- June 26, 2025: SCROLL SISTEMÁTICO CORREGIDO EN TODA LA PLATAFORMA
- June 26, 2025: Todos los modales ahora tienen scroll adecuado con max-h-[90vh] overflow-y-auto
- June 26, 2025: Formulario "Nuevo Prospecto" con campos de alumno completos y scroll funcional
- June 26, 2025: Modales de usuarios, estudiantes, productos y CRM con scroll optimizado
- June 26, 2025: Implementación consistente de contenedores scrolleables en toda la aplicación
- June 26, 2025: CONEXIÓN REAL DE CUENTAS EMPRESARIALES DE REDES SOCIALES
- June 26, 2025: Sistema de autenticación real con Facebook Business Manager, Instagram Business y TikTok Ads Manager
- June 26, 2025: Redirección automática a sitios oficiales para autenticación con credenciales propias de cada escuela
- June 26, 2025: Estados dinámicos de conexión con indicadores visuales rojos/verdes
- June 26, 2025: Botones "Conectar Cuenta" y "Desconectar" funcionales para cada plataforma
- June 26, 2025: Panel de estado actualizado mostrando conexiones reales y fechas de sincronización
- June 26, 2025: Instrucciones claras para colegios sobre cómo conectar sus cuentas empresariales
- June 26, 2025: Manejo de ventanas emergentes para autenticación sin interrumpir el flujo principal
- June 26, 2025: INTEGRACIÓN COMPLETA DE REDES SOCIALES EN CRM
- June 26, 2025: Facebook Ads Manager integrado con configuración completa de campañas publicitarias
- June 26, 2025: Instagram Ads implementado con targeting demográfico y geográfico avanzado
- June 26, 2025: TikTok Ads Manager con configuración de objetivos y presupuestos
- June 26, 2025: Sistema de estimaciones automáticas de alcance, clics y costos totales
- June 26, 2025: Configuración de contenido creativo con títulos, descripciones y llamadas a la acción
- June 26, 2025: Targeting avanzado por edad, ubicación, intereses y comportamiento
- June 26, 2025: Estado de conexión visual para cada plataforma publicitaria
- June 26, 2025: CRM ESCOLAR COMPLETADO CON FUNCIONALIDAD PROFESIONAL
- June 26, 2025: Timeline de actividades similar a HubSpot implementado con línea cronológica vertical
- June 26, 2025: Botones de teléfono, email y calendario con acciones reales funcionales
- June 26, 2025: Sistema completo de análisis de fuentes de contacto con gráficos y recomendaciones
- June 26, 2025: Generación automática de reportes de prospección descargables en formato TXT
- June 26, 2025: Exportación de base de prospectos en formato CSV con todos los datos
- June 26, 2025: Programación de campañas masivas con segmentación de audiencias
- June 26, 2025: Modal de actividades con estados codificados por colores y seguimiento profesional
- June 25, 2025: NUEVAS FUNCIONALIDADES CRM Y GESTIÓN AVANZADA implementadas
- June 25, 2025: Proveedores: Gestión completa con empresa, contacto, WhatsApp, correo, historial facturas
- June 25, 2025: Ex-Alumnos: Registro completo con grado, boletas, certificados, correo, teléfono, ocupación actual
- June 25, 2025: CRM Escolar: Sistema completo para prospectos de familias con seguimiento, probabilidades, pipeline
- June 25, 2025: Sidebar reorganizado por categorías: Principal, Académico, Financiero, Administrativo, Sistema
- June 25, 2025: Schema expandido: providers, alumni, family_prospects, student_prospects, prospect_contacts
- June 25, 2025: FUNCIONALIDADES ADICIONALES IMPLEMENTADAS según requisitos específicos del usuario
- June 25, 2025: Gestión completa de usuarios: crear, modificar, habilitar/deshabilitar, alta/baja del sistema
- June 25, 2025: Catálogo de productos completo: colegiaturas, inscripciones, seguro escolar, libros, otros
- June 25, 2025: Cuentas por cobrar: seguimiento de cartera vencida, gestión de morosidad, reportes de antigüedad
- June 25, 2025: Secciones académicas: separación por Kinder, Primaria, Secundaria, Bachillerato
- June 25, 2025: Gestión de ciclos escolares y configuración por niveles académicos
- June 25, 2025: Schema actualizado con nuevas tablas: bank_movements, product_catalog, accounts_receivable
- June 24, 2025: TODOS LOS 5 MÓDULOS IMPLEMENTADOS según especificaciones exactas del documento
- June 24, 2025: Módulo 1: Configuración inicial - Onboarding guiado < 1 hora
- June 24, 2025: Módulo 2: Emisión de cargos - Generación automática/manual, extraordinarios, recargos por mora
- June 24, 2025: Módulo 3: Portal padres - Pago en 3 clics máximo, móvil-first, notificaciones automáticas
- June 24, 2025: Módulo 4: Caja y conciliación - Pagos efectivo, control bancario, conciliación automática
- June 24, 2025: Módulo 5: Fiscal y contable - CFDI 4.0 automático, integración PAC, reportes SAT
- June 24, 2025: 5 roles implementados: Super Admin, Admin Campus, Caja, Padres, Contador
- June 24, 2025: Preparación completa para integraciones: Stripe/Openpay/Conekta + PAC Facturama

## User Preferences

Preferred communication style: Simple, everyday language.
Architecture preference: SaaS multi-tenant web platform según especificaciones exactas del documento.
Platform type: Plataforma SaaS 100% enfocada en pagos escolares, no ERP ni LMS.
Tecnología requerida: React + Tailwind CSS (PWA ready), Node.js, PostgreSQL, Redis, Stripe/Openpay/Conekta, PAC Facturama.
UX/UI: Móvil primero, proceso de pago 3 clics o menos, onboarding < 1 hora.
Funcionalidad de redes sociales: Integración real con plataformas oficiales (Facebook Business, Instagram Business, TikTok Ads) usando autenticación OAuth y redirección a sitios oficiales para que cada escuela conecte sus propias cuentas empresariales.