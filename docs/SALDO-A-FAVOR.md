# Saldo a favor: inventario y contrato

Base del inventario: `0ada312`. Líneas anteriores a los cambios.

## Creación y consumo

- `server/routes/conciliacion.ts:779-798`: el excedente de caja crea
  `family_credits`, origen `excedente_caja`, pago original y alumno. La búsqueda
  de familia puede devolver nulo: el dinero no desaparece.
- `server/routes/admin.ts:1144-1270`: bloquea crédito y cargo, crea una
  aplicación contra el pago original, consume el crédito y crea el remanente.
  El remanente estaba etiquetado siempre `excedente_caja`, perdiendo el origen.
- `server/seed-demo.ts:813`: crea fixtures; no es un flujo de cobro ordinario.
- Los estados existentes son `activo` y `consumido`. No se introduce
  `disponible`.

## Fórmula y diferencias encontradas

El cálculo de los flujos de caja (`conciliacion.ts:98,311,1820`) es:

    exigible = ROUND(base_centavos * (1 - beca_porcentaje / 100)) + recargos_centavos
    pendiente = exigible - SUM(payment_applications.amount_centavos)

La beca nula y el recargo nulo equivalen a cero. Todo resultado monetario se
expresa en centavos enteros. Para proponer o aplicar se limita a cero el pendiente
de cargos cancelados o reestructurados y nunca se aplica más que el pendiente.

Diferencias en la base:

- `admin.ts:1214`: usaba base menos aplicaciones, ignorando beca y recargos.
- `storage.ts:1546-1588`: sumaba bases sin beca ni recargos, incluyendo cargos
  cancelados; `saldo_neto_centavos` restaba además créditos sin aplicar.
- `admin.ts:614-664`: calculaba beca y recargos, pero restaba créditos sin aplicar
  en `saldo_neto_centavos`; el redondeo se hacía sobre el descuento.
- `stripe-card-settlement.ts:76`: pese a la premisa de la tarea, la liquidación
  de tarjeta sumaba base y recargo sin descontar beca.
- `guardian.ts:529`: la precotización de esa tarjeta también omitía beca.

Los consumidores de `saldo_neto_centavos` en producción son las respuestas de
familias en `misc.ts:1375,1442` y el expediente administrativo de `admin.ts:664`.
No hay una lectura directa de esa propiedad en pantallas ni exportadores.
El pendiente exigido no debe restar crédito activo: crédito y deuda se muestran
por separado hasta existir una aplicación confirmada.

## Decisiones de negocio

El crédito pertenece a la familia; administrador y padre pueden verlo.
No vence ni se pone a cero por cambio de ciclo. Nunca se aplica automáticamente:
la propuesta necesita confirmación del administrador. El padre no puede aplicarlo.
Un crédito sin familia aparece como incidencia para asignación administrativa.

No se encontró un cierre de ciclo que venza o ponga a cero `family_credits`.
Las escrituras ordinarias encontradas son creación, consumo, remanente y
asignación administrativa; la tabla no tiene columna de vencimiento ni ciclo.
La excepción demo protegida reemplaza fixtures y no es un cierre de ciclo.
La prueba de permanencia compara 2026 y 2036 conservando el mismo crédito,
sin predicados temporales ni de ciclo sobre los créditos.

Pago, crédito y resolución Stripe se confirman juntos; auditoría posterior con
reintento durable (ADR-001). No se hacen llamadas a Stripe ni devoluciones.

## Diagnóstico de solo lectura

Destino confirmado: `heliumdb`, marcador `edupay:test`.

```sql
SELECT current_database() AS database_name,
       shobj_description(oid, 'pg_database') AS environment_marker
FROM pg_database WHERE datname = current_database()
```

```sql
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('family_credits','payments','charges','payment_events',
                     'families','family_students')
ORDER BY table_name, ordinal_position
```

```sql
SELECT count(*) AS creditos_sin_familia,
       count(*) FILTER (WHERE status = 'activo') AS activos_sin_familia,
       COALESCE(sum(amount_centavos) FILTER (WHERE status = 'activo'),0)
         AS centavos_activos_sin_familia
FROM family_credits WHERE family_id IS NULL
```

Resultado al iniciar esta ronda: **0 sin familia, 0 activos, 0 centavos activos**.
No se corrigen datos históricos ni se escriben fixtures en heliumdb.
