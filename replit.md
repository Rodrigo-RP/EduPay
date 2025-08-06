# Edupay - Plataforma SaaS de Pagos Escolares

## Overview

Edupay is a SaaS platform designed to automate tuition payments for private schools, aiming to reduce operational burden and delinquency rates. It simplifies payments for parents (1-click payments), automates debt collection, reconciles finances, and streamlines tax invoicing (CFDI) directly with the SAT/PAC. The platform supports paperless school operations, eliminates manual collection calls, and targets over 80% on-time payment rates. It is a multi-tenant, production-ready system.

## User Preferences

Preferred communication style: Simple, everyday language.
Architecture preference: SaaS multi-tenant web platform según especificaciones exactas del documento.
Platform type: Plataforma SaaS 100% enfocada en pagos escolares, no ERP ni LMS.
Tecnología requerida: React + Tailwind CSS (PWA ready), Node.js, PostgreSQL, Redis, Stripe/Openpay/Conekta, PAC Facturama.
UX/UI: Móvil primero, proceso de pago 3 clics o menos, onboarding < 1 hora.
Dashboard preference: Dashboard CEO tradicional como predeterminado para super administrador (no F1 style por problemas de carga).
Funcionalidad de redes sociales: Integración real con plataformas oficiales (Facebook Business, Instagram Business, TikTok Ads) usando autenticación OAuth y redirección a sitios oficiales para que cada escuela conecte sus propias cuentas empresariales.
Sistema verificado: Auditoría sistemática completada - todas las funcionalidades operan con datos reales, no decorativos.
WebSocket: Sistema de tiempo real completamente operativo y libre de fallas críticas (Agosto 2025) - conexiones estables, autenticación JWT robusta, manejo de errores comprehensivo, limpieza automática de memoria, 11 notificaciones implementadas, sin conflictos con Vite HMR.
Configuración de Pagos: Sistema completo implementado (Agosto 2025):
- Interfaz de selección múltiple de meses con checkboxes - permite selección individual o "todos los meses"
- Reglas de recargo con persistencia PostgreSQL - tabla payment_surcharge_rules completamente funcional
- Campo de entrada manual de texto libre para cantidades de dinero (no controles numéricos)
- Mapeo correcto entre tipos frontend (porcentaje_fijo, monto_fijo, porcentaje_diario) y base de datos (porcentaje, fijo, progresivo)
- CRUD completo con validación y conversión automática de centavos/pesos

Gestión de Estudiantes: Sistema adaptado a estructura Excel "Concentrado_Estudiante y Padre" (Agosto 2025):
- Formulario rediseñado con 20 campos específicos según archivo Excel institucional
- Sección PADRE DE FAMILIA (columnas 1-7): correo institucional familiar, nombres, apellidos, CURP, celular, teléfono casa/oficina
- Sección ESTUDIANTE (columnas 8-20): nombres, apellidos, CURP, fecha nacimiento, tipo sangre, correo institucional, nivel escolar, clave centro trabajo, grado, grupo, turno
- Base de datos extendida con nuevas columnas para ambas entidades
- Plantilla de importación/exportación Excel actualizada al formato institucional exacto
- Autenticación corregida en funciones de exportación (auth_token vs token)
- Sistema completamente funcional y listo para datos reales

## System Architecture

### Frontend
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter
- **State Management**: TanStack Query (React Query)
- **UI Framework**: Tailwind CSS with Shadcn/ui
- **Build Tool**: Vite
- **Design**: Mobile-First (Responsive Design), professional, clean dashboard with defined color schemes and templates.

### Backend
- **Runtime**: Node.js with Express.js
- **Language**: TypeScript with ES modules
- **Authentication**: JWT-based with bcrypt hashing
- **API Design**: RESTful API with role-based access control
- **Multi-tenancy**: Campus-level isolation for multiple schools

### Database
- **ORM**: Drizzle ORM with PostgreSQL
- **Database**: PostgreSQL
- **Schema**: Multi-tenant architecture (tenants, campuses, users, students, financial entities)
- **Migrations**: Drizzle Kit

### Key Components
- **User Roles**: 7 specific roles with granular permissions (super_admin, administrador_general, administrador_campus, contador_general, auxiliar_contable, asistente, admisiones).
- **Multi-Tenant Architecture**: Supports school groups and individual campuses with data separation and role hierarchy.
- **Student & Guardian Management**: Comprehensive profiles, flexible relationships, academic tracking.
- **Core Modules**: Initial Setup, Charge Issuance, Parent/Guardian Portal, Cashier & Reconciliation, Fiscal & Accounting, Migration System, Institutional Credentials Management, Institutional Information Management.
- **Real-Time Communication**: WebSocket server implementado con autenticación JWT para actualizaciones en tiempo real. Sistema configurado en ruta `/ws/realtime` para evitar conflictos con HMR de Vite. Incluye rate limiting, heartbeat, y reconexión automática.
- **Notification System**: Multi-channel automated reminders (email, SMS, WhatsApp) for payments and overdue alerts. Internal plugin-based notification system for institutional credential expiration monitoring with real-time alerts and urgency classification.
- **Advanced Systems**: Predictive Engine (for delinquency), Automatic Bank Reconciliation (with SPEI integration), Intelligent Fiscal Invoicing (SAT compliance, auto-selection of product/service keys).
- **Security**: AES-256 encryption, 2FA/MFA, real-time fraud detection, WAF, anti-SQL injection, XSS, brute force, CSRF, command injection protection.

## External Dependencies

- **Payment Gateways**: Stripe, Openpay, Conekta, Evo Payment
- **Fiscal Integration**: PAC Facturama / Enlace Fiscal (for CFDI timbrado)
- **Database**: Neon Database (PostgreSQL)
- **UI Libraries**: @radix-ui/*, tailwindcss, class-variance-authority, lucide-react
- **Data Management**: TanStack Query (React Query)
- **Other**: Redis (for notification queues)