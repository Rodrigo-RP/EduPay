# Devoluciones de saldo a favor

## Autorización y evidencia

Sólo `administrador_general` y `super_admin`, con el permiso existente
`PAYMENTS.PROCESS`, pueden preparar y confirmar. La primera confirmación guarda
el motivo, el importe, el crédito y el método. La segunda exige el TOTP vigente
del mismo administrador; no acepta códigos de respaldo. El secreto TOTP no se
guarda en la devolución, no se responde y no se registra en logs.

La deuda, el pago original y sus aplicaciones permanecen intactos. Se bloquean
el crédito y el pago para verificar el importe disponible. La base limita una
operación viva por crédito; la referencia a Stripe es generada por el servidor.
El crédito queda `en_devolucion`, no disponible para aplicar a cargos.
Al completar, pasa a `devuelto`; un parcial crea otro crédito por el remanente
con el mismo origen. La auditoría se escribe después del COMMIT con reintento
durable, conforme a ADR-001.

## Qué método se ofrece

- `excedente_caja`: efectivo. El administrador declara que **ya entregó** el
  dinero, con motivo, segunda confirmación y TOTP. La salida se suma por día
  escolar en el corte de caja. Los ingresos históricos no se reescriben;
  la diferencia de efectivo considera ingresos menos devoluciones. No se
  permiten salidas nuevas una vez cerrado el día; ambos caminos usan el mismo
  bloqueo de campus. El corte y su consulta muestran el egreso por separado.
- Stripe: sólo un pago Stripe confirmado en MXN, con cuenta conectada.
  Se solicita `reverse_transfer: true`. Para SPEI, máximo 180 días;
  si hace falta correo para recolectar la información del destinatario y no
  hay correo en Stripe, se ofrece transferencia de la escuela. EduPay no
  recolecta ni almacena datos bancarios del padre.
- Tarjeta: **no se aplica el límite de 180 días**. Las fuentes consultadas no
  establecen un plazo numérico general para tarjeta. Una solicitud no garantiza
  que Stripe o el emisor puedan completarla.
- Transferencia de la escuela: SPEI fuera del plazo, falta de correo para ese
  flujo, rechazo inequívoco de creación o devolución fallida con fondos ya
  restituidos a la escuela. Se exigen declaración de transferencia ya realizada,
  motivo, segunda confirmación, TOTP, clave de rastreo y fecha no futura.
  No se capturan CLABE, cuenta ni otros datos bancarios del padre.

Efectivo y transferencia exitosa se muestran como **“Registrada por la escuela”**,
sin afirmar verificación bancaria. Las operaciones preparadas aún no tienen
entrega registrada.

## Stripe: resultado y retorno a la escuela

La respuesta inmediata, incluso `succeeded`, nunca marca exitosa una devolución.
Se conserva pendiente hasta `refund.created`, `refund.updated` o `refund.failed`
verificado por el receptor firmado existente. `charge.refunded` no decide nada.
Se comprueban identidad del pago, importe, moneda y referencia interna.
Se guarda un recibo mínimo del evento, sin datos bancarios del padre.

`pending` mantiene la reserva; `requires_action` además aparece en la bandeja.
`succeeded` confirma; `failed` y `canceled` son fallidas. Eventos duplicados,
tardíos y posteriores a un estado terminal no repiten cambios ni remanentes.

Si Stripe recuperó fondos de la escuela mediante una reversa y la devolución
falla, no se libera el crédito hasta confirmar el retorno de esos fondos.
Se verifica la reversa y el movimiento de balance de la devolución fallida.
La transferencia al destino conectado usa su propia clave de idempotencia e
identificador persistidos. Si falla, la bandeja muestra **“Fondos de la escuela
pendientes de regresar”**. Reintentar exige permiso, confirmación y TOTP.
Sólo entonces el crédito vuelve a activo y se ofrece la transferencia escolar
como alternativa, también para tarjetas.

Un timeout de creación nunca se interpreta como rechazo. Se conserva el crédito
reservado y se reusa la misma clave. Dado que Stripe puede purgar claves después
de 24 horas, EduPay sólo reenvía durante 23 horas desde el primer intento durable.
Fuera de ese margen requiere revisión de la operación en Stripe: no crea otra
solicitud ni libera dinero basándose en la ausencia de respuesta.

## Migración y operación

`0007_quick_sue_storm.sql` agrega únicamente `credit_refunds` y
`credit_refund_events`, sus claves, restricciones e índices. No altera tablas
financieras existentes. Generada y **no aplicada a heliumdb**.
El catálogo exacto y las comprobaciones de CI incluyen las nueve migraciones.

“Apply changes” no forma parte de la entrega: el hook `scripts/post-merge.sh`
ejecuta `npm run db:migrate` sobre la base configurada.
No se han realizado operaciones autenticadas contra Stripe para validar esto;
el proveedor se sustituye en la frontera en las pruebas.

## Fuentes oficiales consultadas (2026-11-02)

- [Destination charges, refunds y failed refunds](https://docs.stripe.com/connect/destination-charges#issue-refunds):
  `reverse_transfer`, parciales y transferencia separada de regreso a la escuela.
- [Mexico bank transfers, refunds](https://docs.stripe.com/payments/mx-bank-transfers#refunds):
  180 días, asincronía, no cancelación en México y retorno a cuenta original.
- [Refunding customer balance](https://docs.stripe.com/payments/customer-balance/refunding):
  información bancaria requerida y recolección por correo realizada por Stripe.
- [Refund object](https://docs.stripe.com/api/refunds/object) y
  [create refund](https://docs.stripe.com/api/refunds/create): estados y parámetros.
- [Refund events y failed refunds](https://docs.stripe.com/refunds#refund-events).
- [Create transfer](https://docs.stripe.com/api/transfers/create):
  destino conectado, importe y moneda.
- [Idempotent requests](https://docs.stripe.com/api/idempotent_requests):
  conservación de resultados y posible purga después de 24 horas.
- [How to refund a customer](https://support.stripe.com/questions/how-to-refund-a-customer)
  y [Refunds in Mexico](https://support.stripe.com/questions/refunds-in-mexico):
  no establecen un plazo numérico general de presentación para tarjetas;
  los tiempos de procesamiento no son un plazo para solicitar.
