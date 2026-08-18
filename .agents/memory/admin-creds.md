---
name: Admin credentials for Instituto JFR demo
description: Credenciales reales de demo — rodrigorp NO existe, usar admin.campus
---

## Credenciales válidas en demo seed

| Email | Password | Role | campus_id |
|-------|----------|------|-----------|
| admin.campus@jfr.edu.mx | Demo2025! | administrador_campus | 1 (JFR — DB actual con RESTART IDENTITY) |
| superadmin@edupay.mx | Demo2025! | super_admin | null |

## IMPORTANTE
- `rodrigorp@institutojfr.edu.mx / [REDACTED]` — NO existe en la base de datos de demo. Este usuario aparece en la pantalla de login como placeholder visual pero no está en el seed.
- Para validaciones y pruebas de API, usar `admin.campus@jfr.edu.mx`.
- El campus_id era 48 en sesiones anteriores, pero después de un TRUNCATE RESTART IDENTITY el campus quedó con campus_id=1. Siempre verificar con el login real antes de usar un campus_id hardcodeado.

**Why:** En sesiones anteriores se intentó hacer login con rodrigorp y fallaba con 401. El campus_id=48 estaba en memory pero era de un seed anterior — el login real devuelve el valor correcto.

## Stripe Connect
- Cuenta Express creada para campus_id=1: `acct_1U5eFqE4HOJNFIv4` (en `campus_payment_config`)
- `STRIPE_SECRET_KEY` actual en Replit: clave de prueba de Refereence, válida — verificada el 2026-08-17 con HTTP 200 real en `/api/admin/campus-payment/conectar-stripe`.
