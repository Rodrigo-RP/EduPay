# Edupay - Plataforma SaaS de Pagos Escolares

## Overview

Edupay is a SaaS platform designed to automate tuition payments for private schools. Its core purpose is to reduce operational burden and delinquency rates. Key problems solved include simplifying payments for parents (1-click payments), automating debt collection, reconciling finances, and streamlining tax invoicing (CFDI) directly with the SAT/PAC. The ideal usage aims for paperless school operations, elimination of manual collection calls, and over 80% on-time payment rates. The platform is multi-tenant, supporting multiple schools, and is production-ready.

## User Preferences

Preferred communication style: Simple, everyday language.
Architecture preference: SaaS multi-tenant web platform según especificaciones exactas del documento.
Platform type: Plataforma SaaS 100% enfocada en pagos escolares, no ERP ni LMS.
Tecnología requerida: React + Tailwind CSS (PWA ready), Node.js, PostgreSQL, Redis, Stripe/Openpay/Conekta, PAC Facturama.
UX/UI: Móvil primero, proceso de pago 3 clics o menos, onboarding < 1 hora.
Dashboard preference: Dashboard CEO tradicional como predeterminado para super administrador (no F1 style por problemas de carga).
Funcionalidad de redes sociales: Integración real con plataformas oficiales (Facebook Business, Instagram Business, TikTok Ads) usando autenticación OAuth y redirección a sitios oficiales para que cada escuela conecte sus propias cuentas empresariales.
Sistema verificado: Auditoría sistemática completada - todas las funcionalidades operan con datos reales, no decorativos.
Credenciales estándar: @institutojfr.edu.mx para todos los perfiles de usuario del Instituto JFR.
Estado actual: Sistema 100% funcional con nuevas funcionalidades implementadas:
- ✅ Sistema de migración Replit → Refeerence completado y validado
- ✅ Gestión de credenciales institucionales operativa para administradores
- ✅ API pública accesible para integración con sistemas externos
- ✅ Notificaciones automáticas de vencimiento de credenciales
- ✅ Encriptación segura de contraseñas institucionales
- ✅ Administrador real del Instituto JFR configurado (rodrigorp@institutojfr.edu.mx)
- ✅ Datos reales del Instituto JFR implementados con 10 conceptos de pago
- ✅ Sistema de notificaciones funcionando con credenciales reales
- ✅ 18 alumnos reales importados exitosamente (primaria, secundaria, preparatoria)
- ✅ Login mejorado con botón mostrar/ocultar contraseña implementado
- ✅ Sistema de autenticación completamente funcional sin errores JSON
- ✅ Sistema de información institucional RFC/CCT por secciones educativas completado
- ✅ CRUD completo para gestión de RFC y CCT (Kinder, Primaria, Secundaria, Bachillerato)
- ✅ API endpoints institucionales funcionando correctamente
- ✅ Sistema unificado de gestión de usuarios implementado con nuevos roles específicos
- ✅ Generación automática de credenciales (usuario/contraseña) para nuevos usuarios
- ✅ Sistema de regeneración de credenciales para usuarios existentes
- ✅ Interfaz completa para compartir credenciales de forma segura
- ✅ Eliminada duplicación entre Administrativo-Usuarios y Configuración-Usuarios
- ✅ Roles específicos: Administrador General, Administrador Campus, Contador General, Auxiliar Contable, Asistente, Admisiones
- ✅ Sistema de permisos granulares con gestión visual implementado
- 🔄 reCAPTCHA preparado para implementar (pendiente claves de Google)

## System Architecture

### Frontend
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter
- **State Management**: TanStack Query (React Query)
- **UI Framework**: Tailwind CSS with Shadcn/ui
- **Build Tool**: Vite
- **Design**: Mobile-First (Responsive Design), color schemes and templates for a professional, clean dashboard.

### Backend
- **Runtime**: Node.js with Express.js
- **Language**: TypeScript with ES modules
- **Authentication**: JWT-based with bcrypt hashing
- **API Design**: RESTful API with role-based access control
- **Multi-tenancy**: Campus-level isolation for multiple schools

### Database
- **ORM**: Drizzle ORM with PostgreSQL
- **Database**: PostgreSQL (configured for Neon Database)
- **Schema**: Multi-tenant architecture (tenants, campuses, users, students, financial entities)
- **Migrations**: Drizzle Kit

### Key Components
- **User Roles**: 6 types with granular permissions (Super Admin, Campus Admin, Admissions, Assistant, Finance/Cashier, External Accountant - read-only).
- **Multi-Tenant Architecture**: Supports school groups and individual campuses with data separation.
- **Student & Guardian Management**: Comprehensive profiles, flexible relationships, academic tracking.
- **Core Modules**:
    1.  **Initial Setup**: School registration, student import, payment concepts, due dates, scholarships, payment gateway, PAC integration.
    2.  **Charge Issuance**: Automatic/manual generation, extraordinary charges, late fees, electronic invoices, partial payments.
    3.  **Parent/Guardian Portal**: Dashboard, payment options, recurring payments, invoice history, notifications.
    4.  **Cashier & Reconciliation**: Manual payments, bank control, automatic reconciliation, delinquency reports, KPIs.
    5.  **Fiscal & Accounting**: Automatic CFDI 4.0, PAC integration (Facturama), SAT reports, cancellation log.
    6.  **Migration System**: Complete project migration from Replit to Refeerence platform using official Extensions API.
    7.  **Institutional Credentials**: Secure management of institutional credentials (Firma Electrónica, IDSE, Sellos Digitales, etc.) with intelligent expiration notifications system.
    8.  **Institutional Information Management**: Complete RFC and CCT management system by educational sections (Kinder, Primary, Secondary, High School) with CRUD operations and validation.
    9.  **Notification System**: Real-time plugin-based notification system for credential expiration alerts with urgency levels and automatic monitoring.
- **Notification System**: Multi-channel automated reminders (email, SMS, WhatsApp) for payments and overdue alerts. Internal plugin-based notification system for institutional credential expiration monitoring with real-time alerts and urgency classification.
- **Advanced Systems**: Predictive Engine (for delinquency), Automatic Bank Reconciliation (with SPEI integration), Intelligent Fiscal Invoicing (SAT compliance, auto-selection of product/service keys).
- **Security**: AES-256 encryption, 2FA/MFA, real-time fraud detection, WAF, anti-SQL injection, XSS, brute force, CSRF, command injection protection.

## External Dependencies

- **Payment Gateways**: Stripe, Openpay, Conekta, Evo Payment
- **Fiscal Integration**: PAC Facturama / Enlace Fiscal (for CFDI timbrado)
- **Database**: Neon Database (PostgreSQL)
- **UI Libraries**: @radix-ui/*, tailwindcss, class-variance-authority, lucide-react
- **Data Management**: TanStack Query (React Query)
- **Others**: Node.js, Express.js, Vite, Drizzle ORM, bcrypt, JWT, Redis (for notification queues)