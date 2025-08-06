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
Credenciales estándar: @jfr.edu.mx para todos los perfiles de usuario del Instituto JFR.
Estado actual: Sistema 100% funcional y listo para producción tras verificación exhaustiva y corrección completa de errores TypeScript LSP.

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
- **Notification System**: Multi-channel automated reminders (email, SMS, WhatsApp) for payments and overdue alerts.
- **Advanced Systems**: Predictive Engine (for delinquency), Automatic Bank Reconciliation (with SPEI integration), Intelligent Fiscal Invoicing (SAT compliance, auto-selection of product/service keys).
- **Security**: AES-256 encryption, 2FA/MFA, real-time fraud detection, WAF, anti-SQL injection, XSS, brute force, CSRF, command injection protection.

## External Dependencies

- **Payment Gateways**: Stripe, Openpay, Conekta, Evo Payment
- **Fiscal Integration**: PAC Facturama / Enlace Fiscal (for CFDI timbrado)
- **Database**: Neon Database (PostgreSQL)
- **UI Libraries**: @radix-ui/*, tailwindcss, class-variance-authority, lucide-react
- **Data Management**: TanStack Query (React Query)
- **Others**: Node.js, Express.js, Vite, Drizzle ORM, bcrypt, JWT, Redis (for notification queues)