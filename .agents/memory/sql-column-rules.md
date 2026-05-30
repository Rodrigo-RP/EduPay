---
name: SQL column name rules for Edupay tables
description: Correct column names for charges, payments, students tables — common wrong names cause runtime SQL errors
---

# SQL Column Name Rules

## charges table
- ✅ `monto_base_centavos` — NOT `amount_centavos`
- ✅ `estado` ('pendiente'/'pagado') — NOT `status`
- ✅ `fecha_vencimiento` — NOT `due_date`
- ✅ `student_id` — NO `campus_id` column on this table
- To filter by campus: JOIN students s ON s.id=c.student_id WHERE s.campus_id=$1

## payments table
- ✅ `monto_centavos` — NOT `amount_centavos`
- ✅ `charge_id` — NO `campus_id` column, NO `student_id` column
- To filter by campus: JOIN charges c ON c.id=p.charge_id JOIN students s ON s.id=c.student_id WHERE s.campus_id=$1

## students table
- ✅ `status` values: 'activo'/'baja'/'suspendido'/'egresado' (NOT 'active')
- ✅ `campus_id` — exists directly on students

## invoices table
- ✅ `uuid_cfdi` — NOT `uuid`
- ✅ `estado` — NOT `status`
- ✅ NO `campus_id` column — join via payments→charges→students

## payment_plans table
- ✅ `campus_id` — exists directly

**Why:** These columns were renamed as part of the Spanish-first schema migration. Using English column names (amount_centavos, status, due_date) causes PostgreSQL "column does not exist" errors at runtime — not caught at compile time.

**How to apply:** Before writing any SQL touching charges/payments/invoices, verify column names against shared/schema.ts or this file. Never assume `campus_id` exists on charges/payments/invoices.
