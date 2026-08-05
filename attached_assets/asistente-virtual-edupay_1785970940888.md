# Instrucciones del Proyecto: Asistente Virtual Flotante de EduPay

## 1. Tu rol

Actúas como desarrollador senior de EduPay, la plataforma de cobranza escolar del Instituto JFR. Construyes un asistente virtual flotante que vive 100% dentro de la aplicación, sin depender de ninguna API externa ni de ningún LLM en su primera versión. Toda tu salida (código, comentarios, mensajes de commit) va en español, salvo nombres de variables, funciones y archivos, que van en inglés siguiendo convenciones estándar. Este documento amplía las instrucciones generales del proyecto EduPay; si algo aquí entra en conflicto con esas instrucciones, señálalo antes de codificar.

## 2. Objetivo del asistente

El asistente resuelve dos problemas distintos, en dos capas separadas:

1. Navegación: cuando el administrador no encuentra dónde está una función, escribe en el chat y el asistente lo lleva directo a la pantalla correcta.
2. Autodiagnóstico: cuando el administrador reporta que algo no funciona, el asistente ejecuta una prueba real del módulo afectado dentro del propio servidor de EduPay, interpreta el resultado, y si la causa es conocida, la corrige o guía al administrador para resolverla.

El administrador nunca debería tener que revisar manualmente cada función del sistema para saber si está sana. El asistente hace ese trabajo por él y solo lo interrumpe cuando de verdad necesita una decisión humana.

## 3. Principio de diseño: nada de LLM en v1

El motor de intención es un matcher de palabras clave escrito en TypeScript puro, ejecutado en el servidor. No hay llamadas a OpenAI, Anthropic ni ningún proveedor externo en esta fase. La función que resuelve la intención del usuario debe tener una firma estable desde el día uno, para que el día que el sistema esté completamente probado y estable, sustituirla por una llamada a un LLM sea un cambio de una sola función, no una reescritura:

```typescript
// server/assistant-knowledge.ts
export interface IntentMatch {
  intentId: string;
  route: string;
  confidence: number;
  responseText: string;
}

export function matchIntent(message: string): IntentMatch | null {
  // Implementación v1: comparación de palabras clave contra el catálogo.
  // Implementación futura (Fase 4): esta firma no cambia, solo el cuerpo,
  // que pasará a llamar a un proveedor de LLM con este mismo mensaje.
}
```

Ningún componente de interfaz debe llamar directamente a la lógica de coincidencia de palabras clave. Todo pasa por `matchIntent`, para que el reemplazo futuro no obligue a tocar el frontend.

## 4. Alcance v1: asistente de navegación

### 4.1 Ubicación en la interfaz

Botón flotante en la esquina inferior derecha, visible en todas las pantallas del panel administrativo. Al abrirse, despliega una ventana de chat compacta que no bloquea el resto de la pantalla. Respeta las reglas de diseño ya establecidas para el panel: nada de módulos nuevos que compitan por atención con la bandeja de excepciones, este widget es una herramienta de soporte, no una pantalla principal.

### 4.2 Estructura de `server/assistant-knowledge.ts`

Todo el catálogo de intenciones y rutas vive en este único archivo, para que sea fácil de mantener y ampliar sin tocar el resto del sistema:

```typescript
interface AssistantIntent {
  id: string;
  keywords: string[];
  route: string;
  responseText: string;
}

export const NAVIGATION_INTENTS: AssistantIntent[] = [
  {
    id: 'ver-bandeja-excepciones',
    keywords: ['excepciones', 'pendientes', 'revisar pagos', 'qué falta'],
    route: '/admin/excepciones',
    responseText: 'Te llevo a la bandeja de excepciones.',
  },
  {
    id: 'importar-excel',
    keywords: ['importar', 'excel', 'carga masiva', 'subir alumnos'],
    route: '/admin/importar',
    responseText: 'Te llevo a la importación masiva.',
  },
  // Agregar cada intención nueva como una entrada más de este arreglo.
];
```

### 4.3 Contrato de `matchIntent`

Reglas de comportamiento, no solo de código:

- Si ninguna intención supera un umbral mínimo de coincidencia, el asistente responde que no entendió y ofrece las categorías disponibles, nunca inventa una ruta.
- Cada coincidencia queda registrada (mensaje del usuario, intención resuelta, si el administrador la usó o la descartó) para poder mejorar el catálogo con datos reales, no con suposiciones.
- El catálogo de intenciones de navegación no incluye ninguna acción que modifique datos. Este asistente en su función de navegación solo lee y redirige, nunca escribe.

## 5. Alcance v2: autodiagnóstico y smoke-tests

### 5.1 Disparador

Cuando el mensaje del administrador coincide con una intención de tipo reporte de falla (por ejemplo "no me deja importar el excel", "no se generó la factura", "el reporte no descarga"), el asistente no navega, cambia de modo y ofrece ejecutar una prueba del módulo correspondiente.

### 5.2 Catálogo de pruebas por módulo

Cada módulo crítico tiene una prueba de humo (smoke test) definida en un catálogo propio, separado del catálogo de navegación:

```typescript
interface SmokeTest {
  moduleId: string;
  description: string;
  run: () => Promise<SmokeTestResult>;
}

interface SmokeTestResult {
  ok: boolean;
  failureCode?: string;
  technicalDetail?: string;
}
```

Módulos con prueba obligatoria en esta primera versión: carga masiva de alumnos, generación de fichas de pago, exportación de reportes, y cualquier otro que definas conforme se agregue al sistema.

### 5.3 Entorno de ejecución: regla dura

Ninguna prueba de humo se ejecuta contra datos financieros reales de una familia. Las pruebas verifican conectividad, disponibilidad del servicio y salud del pipeline (por ejemplo: ¿responde el endpoint?, ¿está viva la conexión a base de datos?, ¿está corriendo la cola de BullMQ?, ¿el webhook de sandbox del procesador contesta?), pero nunca crean, modifican ni leen un cargo, pago o factura de una familia real para probarlo. Si una prueba necesita datos de ejemplo, usa exclusivamente registros sintéticos de prueba, aislados del tenant real, nunca datos de producción del Instituto JFR.

### 5.4 Clasificación de resultados

El resultado de cada prueba se clasifica en tres categorías:

- Causa conocida con corrección segura: existe en el catálogo de fixes automáticos y no toca datos financieros. El asistente la aplica y lo informa.
- Causa conocida sin corrección automática permitida: el asistente identifica el problema pero no lo corrige solo, porque toca datos o configuración sensible. Explica el problema y guía al administrador paso a paso.
- Causa desconocida: el asistente no intenta adivinar. Escala directamente con todo el contexto técnico disponible.

### 5.5 Catálogo de fixes automáticos permitidos

Únicamente acciones de infraestructura, reversibles y sin efecto sobre el ledger financiero:

- Reintentar un job atascado en la cola de BullMQ.
- Reintentar la entrega de un webhook que falló por timeout.
- Limpiar una caché de reporte corrupta y regenerarla.
- Reiniciar una conexión de base de datos caída y volver a probar.

Cada corrección automática aplicada queda registrada en `AuditLog` con el mismo nivel de detalle que cualquier otra acción del sistema: qué se detectó, qué se hizo, cuándo, y con qué resultado.

### 5.6 Lo que el asistente jamás corrige por sí solo

Esto no es negociable y debe quedar así en el código, no solo en este documento: el asistente nunca crea, edita, revierte, ni reprocesa por su cuenta un `Charge`, `Payment`, `PaymentApplication`, `Invoice` ni cualquier campo relacionado con el saldo de una familia. Si el smoke-test detecta un problema en esa capa (por ejemplo, un pago que no se aplicó), el asistente solo puede describir el problema, proponer la acción y esperar confirmación explícita del administrador desde el panel, exactamente igual que ya funciona la bandeja de excepciones para el resto del sistema. Un asistente que autocorrige dinero sin supervisión humana contradice el principio de doble confirmación ya establecido para el proyecto.

### 5.7 Escalamiento al administrador

Cuando el asistente no puede resolver solo, entrega un resumen con: qué probó, qué encontró, código de error o log relevante, y una recomendación de siguiente paso. Nunca responde solo "hubo un error" sin contexto: el administrador debe poder decidir sin tener que ir a buscar los logs por su cuenta.

## 6. Principios no negociables de este módulo

- Sin dependencias de LLM ni de ningún servicio externo en v1.
- Toda la lógica de intención y de pruebas vive en archivos propios y separados (`assistant-knowledge.ts` para navegación, un catálogo aparte para smoke-tests), nunca mezclada con la lógica de negocio de cobranza.
- Ninguna prueba automática toca datos financieros reales.
- Ninguna corrección automática toca el ledger, los cargos, los pagos o las facturas.
- Toda corrección automática aplicada queda en `AuditLog`.
- El asistente es una herramienta de soporte visible en todas las pantallas, no una pantalla nueva que compite con la bandeja de excepciones.

## 7. Convenciones de calidad

- Tests unitarios para `matchIntent` con casos de mensajes ambiguos, sin coincidencia, y con coincidencia múltiple.
- Tests de integración para cada smoke-test del catálogo, verificando que nunca lean ni escriban sobre datos de un tenant real.
- Logs estructurados de cada interacción del asistente (mensaje recibido, intención resuelta o prueba ejecutada, resultado), sin registrar nunca datos personales sensibles del padre de familia en el log.
- Commits en Conventional Commits en español.

## 8. Qué no construir en este módulo

- Ninguna integración con un LLM externo en esta fase.
- Ninguna corrección automática sobre datos financieros, aunque parezca segura.
- Ningún flujo donde el asistente tome una acción irreversible sin pasar antes por confirmación del administrador.
- Ninguna pantalla adicional de configuración del asistente; su catálogo se mantiene editando el archivo de conocimiento directamente en el repositorio.

## 9. Criterio de aprobación (Definition of Done)

Ningún incremento de este módulo se considera terminado si no cumple: el `matchIntent` resuelve correctamente los casos del catálogo de prueba, cada smoke-test corre exclusivamente contra datos sintéticos o de infraestructura, cada corrección automática aplicada queda en `AuditLog`, y ningún camino de código permite que el asistente modifique un registro financiero sin confirmación humana explícita.
