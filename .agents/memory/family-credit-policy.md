---
name: Saldo a favor de familias
description: Decisiones de negocio sobre propiedad, aplicación y permanencia de créditos familiares.
---

El saldo a favor pertenece a la familia y lo ven tanto el administrador como
el padre. No vence y pasa al siguiente ciclo. Nunca se aplica automáticamente:
el administrador confirma la propuesta; el padre sólo consulta.

**Why:** Rodrigo decidió expresamente separar dinero disponible de deuda pagada.
Tener crédito sin aplicar no reduce lo que se pide pagar al padre.

**How to apply:** Mostrar pendiente y saldo a favor por separado. Conservar
créditos sin familia como incidencias asignables, nunca descartarlos.
El remanente conserva el origen. Mantener ADR-001: pago, crédito y resolución
en una transacción; auditoría posterior con reintento durable.

Los escenarios de navegador de créditos deben preparar su propio tutor,
vinculado explícitamente a su familia y al campus probado; no reutilizar
implícitamente al tutor global del helper de autenticación.

Las devoluciones manuales de efectivo y transferencia escolar se acreditan
por declaración expresa del administrador, no por webhook. Deben identificarse
como “Registrada por la escuela”, nunca como verificación bancaria.

**Why:** El dueño distinguió expresamente la evidencia de Stripe de una entrega
fuera del proveedor; esos métodos no generan un webhook de Stripe.

**How to apply:** Mantener motivo, doble confirmación y TOTP vigente. En una
transferencia escolar exigir rastreo y fecha sin almacenar datos bancarios del
padre. No trasladar a tarjetas el plazo SPEI de 180 días. Tras una devolución
Stripe fallida con fondos recuperados de la escuela, no habilitar la alternativa
escolar antes de confirmar que esos fondos regresaron a su cuenta conectada.

**Why:** Encontrar una cuenta demo por correo no garantiza que pertenezca al
campus del administrador ni que conserve sus vínculos durante la suite completa.

**How to apply:** Crear y limpiar el tutor como fixture propio, y comprobar con
esa sesión el pendiente y el saldo a favor, sin depender de familias demo ajenas.
