# EscuelaPay - School Payment Management Platform

## Overview

EscuelaPay is a comprehensive SaaS platform designed to automate school payment management for private educational institutions. The system provides a mobile-first experience for parents to pay tuition fees with just 3 clicks, while offering powerful administrative tools for schools to manage students, charges, payments, and financial reporting. The platform includes integrated CFDI invoicing for Mexican tax compliance and advanced features like automatic late fee management and scholarship/discount handling.

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

### Authentication System
- **Dual Authentication**: Separate login flows for administrative users and guardians/parents
- **Role-Based Access**: Super admin, admin, cashier (caja), and accountant (contador) roles
- **JWT Security**: Secure token-based authentication with refresh capabilities
- **2FA Support**: Two-factor authentication integration ready

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

### Financial Management
- **Charge System**: Flexible charge creation with multiple concept types
- **Payment Processing**: Secure payment handling with multiple payment methods
- **Scholarship & Discounts**: Automated discount application system
- **Late Fee Management**: Automatic surcharge calculation for overdue payments
- **CFDI Integration**: Mexican tax compliance with automated invoice generation

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

### Core Dependencies
- **@neondatabase/serverless**: PostgreSQL database connection
- **drizzle-orm**: Type-safe database operations
- **@tanstack/react-query**: Server state management
- **bcrypt**: Password hashing
- **jsonwebtoken**: JWT authentication
- **@stripe/stripe-js**: Payment processing integration

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
- June 24, 2025: Initial SaaS platform setup with multi-tenant architecture
- June 24, 2025: Database schema created with 15 tables supporting multiple schools
- June 24, 2025: Sample data created for 2 school organizations (San Patricio and Montessori)
- June 24, 2025: Admin dashboard and parent portal interfaces configured
- June 24, 2025: Authentication system with separate login flows for staff and parents

## User Preferences

Preferred communication style: Simple, everyday language.