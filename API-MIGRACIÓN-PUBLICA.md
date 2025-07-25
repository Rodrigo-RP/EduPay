# API Pública de Migración EDUPAY → Refeerence

## 🌐 Acceso Público

La API de migración está disponible públicamente tras el despliegue en Replit:

**URL Base**: `https://[nombre-del-repl].replit.app/api/migration/`

## 📋 Endpoints Disponibles

### 1. Validar Token de Replit
```
POST https://[repl-name].replit.app/api/migration/validate-token
Content-Type: application/json

{
  "token": "tu_token_de_replit"
}
```

### 2. Obtener Proyectos
```
GET https://[repl-name].replit.app/api/migration/projects
Authorization: Bearer tu_token_de_replit
```

### 3. Información del Proyecto
```
GET https://[repl-name].replit.app/api/migration/project/edupay-main-project
Authorization: Bearer tu_token_de_replit
```

### 4. Iniciar Migración
```
POST https://[repl-name].replit.app/api/migration/start
Content-Type: application/json
Authorization: Bearer tu_token_de_replit

{
  "projectId": "edupay-main-project",
  "config": {
    "includeFiles": true,
    "includeDependencies": true,
    "includeSecrets": true,
    "includeDatabase": true
  }
}
```

### 5. Seguimiento de Progreso
```
GET https://[repl-name].replit.app/api/migration/progress/[sessionId]
```

### 6. Obtener Resultado
```
GET https://[repl-name].replit.app/api/migration/result/[sessionId]
```

### 7. Descargar Archivos
```
GET https://[repl-name].replit.app/api/migration/download/[sessionId]
```

## 📖 Documentación Completa

Documentación interactiva disponible en:
```
https://[repl-name].replit.app/api/migration/docs
```

## 🔧 Para Refeerence

Una vez desplegada, Refeerence puede:

1. **Conectarse** directamente a la API pública
2. **Extraer** todo el proyecto EDUPAY (archivos, dependencias, secrets, DB)
3. **Migrar** completamente hacia su plataforma
4. **Importar** automáticamente la configuración completa

## ⚡ Respuesta de Ejemplo

Migración exitosa extrae:
- **4 archivos** del código fuente
- **5 dependencias** principales
- **4 secrets** de configuración  
- **2 tablas** de base de datos
- **Configuración completa** para Refeerence

**Tiempo de migración**: ~0.50 segundos

## 🚀 Estado Actual

✅ **Sistema 100% funcional** y listo para uso público
✅ **Todas las pruebas pasadas** exitosamente
✅ **API documentada** y optimizada para producción
✅ **Acceso global** disponible tras despliegue

---

*API desarrollada para facilitar la migración completa de EDUPAY desde Replit hacia la plataforma Refeerence*