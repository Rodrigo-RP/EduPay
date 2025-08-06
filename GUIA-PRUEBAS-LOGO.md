# 🧪 Guía Completa de Pruebas - Logo Institucional

## 📋 Resumen
Esta guía te ayudará a verificar que el logo institucional aparece correctamente en todos los roles y páginas del sistema.

## 🔐 Credenciales de Prueba

### Administrador General
- **Email:** rodrigorp@institutojfr.edu.mx  
- **Contraseña:** 12345678
- **Rol:** administrador_general

### Administrador Campus  
- **Email:** reyna@institutojfr.edu.mx
- **Contraseña:** 12345678
- **Rol:** administrador_campus

## 🧪 Pruebas Automatizadas

### Paso 1: Ejecutar Script de Pruebas Básicas
```javascript
// Ejecutar en la consola del navegador
fetch('/test-logo-institucional.js')
  .then(response => response.text())
  .then(script => eval(script));
```

### Paso 2: Ejecutar Pruebas por Roles
```javascript  
// Ejecutar en la consola del navegador
fetch('/test-roles-logo.js')
  .then(response => response.text())
  .then(script => eval(script));
```

## 🖥️ Pruebas Manuales por Rol

### 👑 Administrador General (rodrigorp@institutojfr.edu.mx)

**Páginas a verificar:**
1. **Dashboard Principal** (`/admin-dashboard`)
   - ✅ Logo debe aparecer en header premium con gradiente azul
   - ✅ Logo debe tener diseño redondeado de 16x16

2. **Gestión de Usuarios** (`/usuarios`)
   - ✅ Logo debe aparecer junto al título "Gestión de Usuarios"
   - ✅ Logo debe tener borde azul y diseño de 12x12

3. **Gestión de Pagos** (`/pagos`)
   - ✅ Logo debe aparecer en header con gradiente moderno
   - ✅ Logo debe integrarse con el diseño de tarjeta blanca

4. **Reportes y Análisis** (`/reportes`)
   - ✅ Logo debe aparecer en header oscuro con filtro blanco
   - ✅ Logo debe ser visible sobre fondo azul-índigo

5. **Cuentas por Cobrar** (`/cuentas-por-cobrar`)
   - ✅ Logo debe aparecer con diseño coherente en rojo
   - ✅ Logo debe tener borde rojo y diseño de 12x12

### 🏢 Administrador Campus (reyna@institutojfr.edu.mx)

**Páginas a verificar:**
1. **Dashboard Principal** (`/admin-dashboard`)
   - ✅ Logo debe aparecer igual que administrador general
   
2. **Gestión de Usuarios** (`/usuarios`)
   - ✅ Logo debe aparecer con mismo diseño
   
3. **Gestión de Pagos** (`/pagos`)
   - ✅ Logo debe aparecer con mismo diseño

### 📚 Otros Roles

**Admisiones:**
- Dashboard Admisiones (`/dashboard-admisiones`)
- ✅ Logo debe aparecer con borde y badge del nombre institucional

**Caja:** 
- Dashboard Caja (`/dashboard-caja`)  
- ✅ Logo debe aparecer con diseño coherente

**Contador:**
- Dashboard Contador (`/dashboard-contador`)
- ✅ Logo debe aparecer para reportes financieros

## 🔍 Verificaciones Técnicas

### 1. Verificar API de Información Institucional
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:5000/api/institutional-info
```

### 2. Verificar Logo en DOM
```javascript
// Ejecutar en consola del navegador
const logos = document.querySelectorAll('img[alt="Logo institucional"]');
console.log(`Logos encontrados: ${logos.length}`);
logos.forEach((logo, i) => {
  console.log(`Logo ${i+1}:`, {
    src: logo.src.substring(0, 50) + '...',
    visible: logo.offsetParent !== null,
    dimensions: `${logo.clientWidth}x${logo.clientHeight}`
  });
});
```

### 3. Verificar Hook useInstitution
```javascript
// Verificar que el hook está cargando datos
localStorage.getItem('auth_token') && 
fetch('/api/institutional-info', {
  headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` }
})
.then(r => r.json())
.then(data => console.log('Datos institucionales:', data));
```

## ✅ Lista de Verificación

### Dashboards Principales
- [ ] Admin Dashboard - Logo premium con gradiente
- [ ] Dashboard Admisiones - Logo con borde y badge  
- [ ] Dashboard Caja - Logo coherente con branding
- [ ] Dashboard Contador - Logo para reportes

### Páginas Administrativas  
- [ ] Gestión Usuarios - Logo en header azul
- [ ] Gestión Pagos - Logo en header con gradiente
- [ ] Reportes - Logo con filtro blanco para fondo oscuro
- [ ] Cuentas por Cobrar - Logo con diseño rojo

### Roles Específicos
- [ ] Administrador General - Acceso completo
- [ ] Administrador Campus - Dashboards administrativos
- [ ] Auxiliar Contable - Dashboard contador
- [ ] Asistente - Dashboard admisiones  
- [ ] Admisiones - Dashboard admisiones

## 🐛 Solución de Problemas

### Logo no aparece:
1. Verificar que hay token de autenticación válido
2. Verificar que la API `/api/institutional-info` responde
3. Verificar que el logo_url existe en la respuesta
4. Verificar consola de errores en navegador

### Logo aparece roto:
1. Verificar que logo_url es un data URL válido
2. Verificar que no hay HTML entities sin decodificar
3. Verificar que la imagen tiene tamaño adecuado

### Logo no se actualiza:
1. Limpiar cache del navegador
2. Verificar que useInstitution hook está invalidando cache
3. Verificar que React Query está funcionando correctamente

## 📊 Criterios de Éxito

**✅ ÉXITO COMPLETO:** 
- Logo visible en todas las páginas principales
- Logo coherente con diseño de cada interfaz  
- Logo funciona para todos los roles de usuario
- No hay errores en consola del navegador

**⚠️ PARCIAL:**
- Logo visible en la mayoría de páginas
- Algunos roles no ven el logo correctamente
- Errores menores en consola

**❌ FALLO:**
- Logo no aparece en páginas principales
- Múltiples errores en consola
- API de información institucional no responde

## 🎯 Siguiente Paso
Una vez completadas las pruebas, documenta los resultados y cualquier issue encontrado para su corrección.