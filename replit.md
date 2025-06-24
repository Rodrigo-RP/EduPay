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
- June 24, 2025: Corrección de arquitectura para seguir especificaciones exactas del documento
- June 24, 2025: Implementación de los 5 roles específicos requeridos
- June 24, 2025: Configuración de los 5 módulos principales según especificaciones
- June 24, 2025: Ajuste a tecnología específica: React + Tailwind + Node.js + PostgreSQL + Redis
- June 24, 2025: Preparación para integraciones requeridas: Stripe/Openpay/Conekta + PAC Facturama

## User Preferences

Preferred communication style: Simple, everyday language.
Architecture preference: SaaS multi-tenant web platform según especificaciones exactas del documento.
Platform type: Plataforma SaaS 100% enfocada en pagos escolares, no ERP ni LMS.
Tecnología requerida: React + Tailwind CSS (PWA ready), Node.js, PostgreSQL, Redis, Stripe/Openpay/Conekta, PAC Facturama.
UX/UI: Móvil primero, proceso de pago 3 clics o menos, onboarding < 1 hora.