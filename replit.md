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
- **Notification System**: Multi-channel automated reminders (email, SMS, WhatsApp) for payments and overdue alerts. Internal plugin-based notification system for institutional credential expiration monitoring with real-time alerts and urgency classification. WebSocket server for real-time synchronization of data.
- **Advanced Systems**: Predictive Engine (for delinquency), Automatic Bank Reconciliation (with SPEI integration), Intelligent Fiscal Invoicing (SAT compliance, auto-selection of product/service keys).
- **Security**: AES-256 encryption, 2FA/MFA, real-time fraud detection, WAF, anti-SQL injection, XSS, brute force, CSRF, command injection protection.

## External Dependencies

- **Payment Gateways**: Stripe, Openpay, Conekta, Evo Payment
- **Fiscal Integration**: PAC Facturama / Enlace Fiscal (for CFDI timbrado)
- **Database**: Neon Database (PostgreSQL)
- **UI Libraries**: @radix-ui/*, tailwindcss, class-variance-authority, lucide-react
- **Data Management**: TanStack Query (React Query)
- **Other**: Redis (for notification queues)