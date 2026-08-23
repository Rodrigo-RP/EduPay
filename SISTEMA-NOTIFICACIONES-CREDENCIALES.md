# Sistema de Notificaciones de Credenciales Institucionales

## Descripción General

Sistema plugin interno para monitoreo automático y notificación de credenciales institucionales próximas a vencer, diseñado para administradores del sistema EDUPAY.

## Funcionalidades Implementadas

### ✅ Detección Automática
- Monitoreo continuo de fechas de vencimiento
- Alertas 15 días antes del vencimiento
- Actualización en tiempo real cada 30 segundos

### ✅ Clasificación por Urgencia
- **Alta**: ≤ 3 días (Rojo)
- **Media**: ≤ 7 días (Amarillo) 
- **Baja**: ≤ 15 días (Azul)
- **Vencidas**: Credenciales expiradas (Gris)

### ✅ Interfaz de Usuario
- Nueva pestaña "Notificaciones" en perfil de administrador
- Badge con contador de notificaciones pendientes
- Tarjetas informativas por credencial
- Estadísticas visuales de urgencia
- Función "marcar como vista"

### ✅ API Backend
- `GET /api/profile/credential-notifications` - Lista de notificaciones
- `GET /api/profile/notification-stats` - Estadísticas de urgencia
- `POST /api/profile/credential-notifications/:id/seen` - Marcar como vista

## Tipos de Credenciales Soportados

- Firma Electrónica
- Sellos Digitales
- IDSE
- Tarjeta Patronal
- INFONAVIT
- Otras (personalizable)

## Arquitectura Técnica

### Backend
- **NotificationSystem**: Clase para lógica de notificaciones
- **Rutas API**: Endpoints seguros con autenticación JWT
- **Base de Datos**: Tabla `institutional_credentials` con campo `last_notification_sent`

### Frontend
- **CredentialNotifications**: Componente principal de notificaciones
- **CredentialNotificationsBadge**: Badge contador para tabs
- **Integración React Query**: Actualización automática y cache

## Pruebas Realizadas

### ✅ Pruebas de Funcionalidad
- Creación de credenciales con fechas próximas a vencer
- Verificación de detección automática de urgencia
- Prueba de marcado como "vista"
- Validación de estadísticas en tiempo real

### ✅ Datos de Prueba Activos
- 3 credenciales configuradas para la cuenta administrativa de prueba retirada
- 2 credenciales urgencia ALTA (vencen en 2 días)
- 1 credencial urgencia BAJA (vence en 8 días)

## Estado Actual

**Sistema 100% funcional y operativo**

- ✅ Backend API completamente funcional
- ✅ Frontend integrado en perfil de administrador
- ✅ Notificaciones detectadas y mostradas correctamente
- ✅ Sistema de urgencia funcionando
- ✅ Actualización automática implementada
- ✅ Pruebas exitosas con datos reales

## Beneficios

1. **Proactivo**: Previene vencimientos inesperados
2. **Automático**: Sin intervención manual requerida
3. **Visual**: Interface clara y organizada por urgencia
4. **Integrado**: Parte nativa del sistema EDUPAY
5. **Seguro**: Solo administradores pueden ver notificaciones
6. **Escalable**: Fácil agregar nuevos tipos de credenciales

## Uso

1. Acceder como administrador al sistema
2. Ir a "Mi Perfil"
3. Seleccionar pestaña "Notificaciones" 
4. Ver alertas organizadas por urgencia
5. Marcar como "vista" las notificaciones procesadas

El sistema mantiene un monitoreo continuo y alertará automáticamente sobre cualquier credencial próxima a vencer.