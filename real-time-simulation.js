/**
 * SIMULACIÓN EN TIEMPO REAL - Dashboard CEO Wall Street
 * Genera datos dinámicos para demostrar el centro de comando ejecutivo
 */

const API_BASE = 'http://localhost:5000';

class RealTimeSimulation {
  constructor() {
    this.isRunning = false;
    this.intervalIds = [];
    this.simulationData = {
      revenue: 2847320,
      transactionsCount: 0,
      activeSchools: 18,
      alerts: []
    };
  }

  async startSimulation() {
    console.log('🚀 INICIANDO SIMULACIÓN TIEMPO REAL - Dashboard CEO');
    console.log('📊 Generando actividad de plataforma SaaS...\n');
    
    this.isRunning = true;
    
    // Simular transacciones en tiempo real cada 3-8 segundos
    this.scheduleTransactions();
    
    // Simular cambios de revenue cada 5 segundos
    this.scheduleRevenueUpdates();
    
    // Simular alertas ejecutivas cada 30 segundos
    this.scheduleExecutiveAlerts();
    
    // Simular eventos de escuelas cada 15 segundos
    this.scheduleSchoolEvents();
    
    // Mostrar métricas en consola cada 10 segundos
    this.scheduleMetricsDisplay();
    
    console.log('✅ Simulación iniciada - Dashboard CEO funcionando en tiempo real');
    console.log('🎯 Ve el dashboard en: /super-admin');
    console.log('📈 Los datos se actualizan automáticamente\n');
  }

  scheduleTransactions() {
    const generateTransaction = () => {
      if (!this.isRunning) return;
      
      const schools = [
        'Colegio Cervantes', 'Instituto Morelos', 'Escuela Hidalgo',
        'Colegio Juárez', 'Instituto Allende', 'Escuela Reforma'
      ];
      
      const concepts = [
        'Colegiatura Enero', 'Inscripción 2025', 'Seguro Escolar',
        'Uniforme', 'Libros', 'Laboratorio'
      ];
      
      const amount = Math.floor(Math.random() * 3000) + 1500;
      const isSuccess = Math.random() > 0.08; // 92% success rate
      
      const transaction = {
        id: `TX${Date.now()}`,
        time: new Date().toLocaleTimeString('es-MX', { hour12: false }),
        school: schools[Math.floor(Math.random() * schools.length)],
        concept: concepts[Math.floor(Math.random() * concepts.length)],
        amount: amount,
        status: isSuccess ? 'success' : 'failed'
      };
      
      if (isSuccess) {
        this.simulationData.revenue += amount;
        this.simulationData.transactionsCount++;
      }
      
      console.log(`💳 TRANSACCIÓN: ${transaction.school} - $${amount.toLocaleString()} - ${transaction.status.toUpperCase()}`);
      
      // Programar próxima transacción en 3-8 segundos
      const nextDelay = 3000 + Math.random() * 5000;
      const timeoutId = setTimeout(generateTransaction, nextDelay);
      this.intervalIds.push(timeoutId);
    };
    
    generateTransaction();
  }

  scheduleRevenueUpdates() {
    const intervalId = setInterval(() => {
      if (!this.isRunning) return;
      
      const oldRevenue = this.simulationData.revenue;
      const growth = Math.floor(Math.random() * 8000) + 2000;
      this.simulationData.revenue += growth;
      
      const growthPercent = ((growth / oldRevenue) * 100).toFixed(2);
      console.log(`📈 REVENUE UPDATE: +$${growth.toLocaleString()} (+${growthPercent}%) - Total: $${this.simulationData.revenue.toLocaleString()}`);
    }, 5000);
    
    this.intervalIds.push(intervalId);
  }

  scheduleExecutiveAlerts() {
    const alertTypes = [
      {
        type: 'revenue',
        severity: 'high',
        message: 'Revenue spike detected - investigating payment surge'
      },
      {
        type: 'system',
        severity: 'medium', 
        message: 'Payment gateway latency increased to 2.1s'
      },
      {
        type: 'business',
        severity: 'low',
        message: 'New school completed onboarding process'
      },
      {
        type: 'security',
        severity: 'high',
        message: 'Unusual login pattern detected from new IP range'
      }
    ];
    
    const intervalId = setInterval(() => {
      if (!this.isRunning) return;
      
      const alert = alertTypes[Math.floor(Math.random() * alertTypes.length)];
      this.simulationData.alerts.push({
        ...alert,
        timestamp: new Date().toISOString(),
        id: Date.now()
      });
      
      // Mantener solo las últimas 5 alertas
      if (this.simulationData.alerts.length > 5) {
        this.simulationData.alerts.shift();
      }
      
      console.log(`🚨 EXECUTIVE ALERT [${alert.severity.toUpperCase()}]: ${alert.message}`);
    }, 30000);
    
    this.intervalIds.push(intervalId);
  }

  scheduleSchoolEvents() {
    const events = [
      'Nueva escuela registrada en plataforma',
      'Campus completó configuración inicial',
      'Migración de datos finalizada exitosamente',
      'Integración de pasarela de pago activada',
      'Sistema de facturación CFDI configurado'
    ];
    
    const intervalId = setInterval(() => {
      if (!this.isRunning) return;
      
      const event = events[Math.floor(Math.random() * events.length)];
      console.log(`🏫 SCHOOL EVENT: ${event}`);
      
      // Incrementar escuelas activas ocasionalmente
      if (Math.random() > 0.7) {
        this.simulationData.activeSchools++;
        console.log(`📊 Total escuelas activas: ${this.simulationData.activeSchools}`);
      }
    }, 15000);
    
    this.intervalIds.push(intervalId);
  }

  scheduleMetricsDisplay() {
    const intervalId = setInterval(() => {
      if (!this.isRunning) return;
      
      const metrics = {
        revenue: this.simulationData.revenue,
        transactions: this.simulationData.transactionsCount,
        schools: this.simulationData.activeSchools,
        alerts: this.simulationData.alerts.length,
        successRate: '98.7%',
        uptime: '99.94%'
      };
      
      console.log('\n' + '='.repeat(60));
      console.log('📊 MÉTRICAS EJECUTIVAS EN TIEMPO REAL');
      console.log('='.repeat(60));
      console.log(`💰 Revenue Total: $${metrics.revenue.toLocaleString()}`);
      console.log(`💳 Transacciones: ${metrics.transactions}`);
      console.log(`🏫 Escuelas Activas: ${metrics.schools}`);
      console.log(`🚨 Alertas Activas: ${metrics.alerts}`);
      console.log(`✅ Tasa de Éxito: ${metrics.successRate}`);
      console.log(`⚡ Uptime: ${metrics.uptime}`);
      console.log('='.repeat(60) + '\n');
    }, 10000);
    
    this.intervalIds.push(intervalId);
  }

  stopSimulation() {
    console.log('🛑 Deteniendo simulación...');
    this.isRunning = false;
    
    // Limpiar todos los intervalos
    this.intervalIds.forEach(id => {
      if (typeof id === 'number') {
        clearInterval(id);
      } else {
        clearTimeout(id);
      }
    });
    
    this.intervalIds = [];
    console.log('✅ Simulación detenida');
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      data: this.simulationData,
      activeIntervals: this.intervalIds.length
    };
  }
}

// Ejecutar simulación
const simulation = new RealTimeSimulation();

// Manejar salida limpia
process.on('SIGINT', () => {
  simulation.stopSimulation();
  process.exit(0);
});

process.on('SIGTERM', () => {
  simulation.stopSimulation();
  process.exit(0);
});

// Iniciar simulación
simulation.startSimulation();

// Mostrar estado cada minuto
setInterval(() => {
  const status = simulation.getStatus();
  if (status.isRunning) {
    console.log(`\n🔄 SIMULATION STATUS: Running | Intervals: ${status.activeIntervals} | Revenue: $${status.data.revenue.toLocaleString()}\n`);
  }
}, 60000);

// Mantener el proceso vivo
setInterval(() => {
  // Keep alive
}, 1000);