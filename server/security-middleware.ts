/**
 * MIDDLEWARE DE SEGURIDAD EMPRESARIAL
 * Protección completa contra ataques y vulnerabilidades
 */

import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import cors from 'cors';
import ExpressBrute from 'express-brute';
import { createHash } from 'crypto';
import winston from 'winston';
import expressWinston from 'express-winston';
import { AttackProtection, SecurityAudit, FraudDetection } from '@shared/security-engine';

// ========================================
// CONFIGURACIÓN DE LOGGING SEGURO
// ========================================

const securityLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/security-error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/security-combined.log' }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

// ========================================
// PROTECCIÓN CONTRA BRUTE FORCE
// ========================================

const bruteForceStore = new ExpressBrute.MemoryStore();
const bruteForce = new ExpressBrute(bruteForceStore, {
  freeRetries: 5,
  minWait: 5 * 60 * 1000, // 5 minutos
  maxWait: 60 * 60 * 1000, // 1 hora
  failCallback: (req: Request, res: Response, next: NextFunction) => {
    SecurityAudit.logSecurityEvent({
      userId: (req as any).user?.id,
      action: 'BRUTE_FORCE_DETECTED',
      resource: req.path,
      result: 'BLOCKED',
      ipAddress: req.ip || 'unknown',
      userAgent: req.get('User-Agent') || 'unknown',
      metadata: { attempts: req.body },
      severity: 'CRITICAL'
    });

    res.status(429).json({
      error: 'Demasiados intentos fallidos',
      message: 'Su cuenta ha sido bloqueada temporalmente por seguridad',
      retryAfter: 300
    });
  }
});

// ========================================
// RATE LIMITING INTELIGENTE
// ========================================

const createRateLimit = (windowMs: number, max: number, message: string) => {
  return rateLimit({
    windowMs,
    max,
    // Omitir solo cuando el request incluye el header de bypass de tests
    // Y el servidor no está en producción. El browser real en dev nunca
    // envía este header → rate-limit activo para tráfico real.
    // En producción NODE_ENV==='production' anula la condición en cualquier caso.
    skip: (req) =>
      process.env.NODE_ENV !== 'production' &&
      req.headers['x-test-bypass'] === 'vitest-internal',
    message: { error: message },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req: Request, res: Response) => {
      SecurityAudit.logSecurityEvent({
        userId: (req as any).user?.id,
        action: 'RATE_LIMIT_EXCEEDED',
        resource: req.path,
        result: 'BLOCKED',
        ipAddress: req.ip || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown',
        metadata: { limit: max, window: windowMs },
        severity: 'WARN'
      });

      res.status(429).json({
        error: 'Límite de requests excedido',
        message,
        retryAfter: Math.ceil(windowMs / 1000)
      });
    }
  });
};

// Diferentes límites según el endpoint
export const rateLimits = {
  general: createRateLimit(15 * 60 * 1000, 100, 'Demasiadas solicitudes generales'),
  auth: createRateLimit(15 * 60 * 1000, 10, 'Demasiados intentos de autenticación'),
  payment: createRateLimit(60 * 60 * 1000, 20, 'Demasiadas solicitudes de pago'),
  api: createRateLimit(5 * 60 * 1000, 50, 'Demasiadas solicitudes a la API')
};

// ========================================
// MIDDLEWARE DE VALIDACIÓN DE INPUT
// ========================================

export const validateInput = (req: Request, res: Response, next: NextFunction) => {
  try {
    // Validar query parameters
    for (const [key, value] of Object.entries(req.query)) {
      if (typeof value === 'string') {
        const attack = AttackProtection.detectAttack(value);
        if (attack) {
          SecurityAudit.logSecurityEvent({
            userId: (req as any).user?.id,
            action: 'ATTACK_DETECTED',
            resource: req.path,
            result: 'BLOCKED',
            ipAddress: req.ip || 'unknown',
            userAgent: req.get('User-Agent') || 'unknown',
            metadata: { attackType: attack.type, parameter: key, value },
            severity: 'CRITICAL'
          });

          return res.status(400).json({
            error: 'Input inválido detectado',
            message: 'Su solicitud contiene contenido no permitido'
          });
        }
      }
    }

    // Validar body
    if (req.body && typeof req.body === 'object') {
      const isValid = AttackProtection.validateDataStructure(req.body);
      if (!isValid) {
        SecurityAudit.logSecurityEvent({
          userId: (req as any).user?.id,
          action: 'MALICIOUS_PAYLOAD',
          resource: req.path,
          result: 'BLOCKED',
          ipAddress: req.ip || 'unknown',
          userAgent: req.get('User-Agent') || 'unknown',
          metadata: { body: req.body },
          severity: 'CRITICAL'
        });

        return res.status(400).json({
          error: 'Datos inválidos',
          message: 'El contenido enviado no es válido'
        });
      }
    }

    next();
  } catch (error) {
    securityLogger.error('Error en validación de input:', error);
    res.status(500).json({ error: 'Error interno de validación' });
  }
};

// ========================================
// MIDDLEWARE DE DETECCIÓN DE FRAUDE
// ========================================

export const fraudDetection = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).user;
    if (!user) return next();

    const securityEvent = {
      eventId: createHash('md5').update(`${req.ip}-${Date.now()}`).digest('hex'),
      userId: user.id,
      eventType: req.path.includes('/payment') ? 'PAYMENT_REQUEST' as const :
                req.path.includes('/auth') ? 'LOGIN_ATTEMPT' as const : 'DATA_ACCESS' as const,
      severity: 'MEDIUM' as const,
      details: {
        method: req.method,
        path: req.path,
        body: req.body
      },
      ipAddress: req.ip || 'unknown',
      userAgent: req.get('User-Agent') || 'unknown',
      timestamp: new Date(),
      riskScore: 0
    };

    // Obtener historial (en producción desde base de datos)
    const historicalData: any[] = []; // Tipado explícito para desarrollo

    const fraudSignals = FraudDetection.analyzeBehavior(securityEvent, historicalData);
    const riskScore = FraudDetection.calculateRiskScore(fraudSignals);

    securityEvent.riskScore = riskScore;

    if (riskScore > 80) {
      SecurityAudit.logSecurityEvent({
        userId: user.id,
        action: 'HIGH_RISK_ACTIVITY',
        resource: req.path,
        result: 'BLOCKED',
        ipAddress: req.ip || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown',
        metadata: { riskScore, signals: fraudSignals },
        severity: 'CRITICAL'
      });

      return res.status(403).json({
        error: 'Actividad sospechosa detectada',
        message: 'Su solicitud ha sido bloqueada por medidas de seguridad',
        riskScore: Math.floor(riskScore)
      });
    }

    // Agregar información de riesgo al request
    (req as any).riskScore = riskScore;
    (req as any).fraudSignals = fraudSignals;

    next();
  } catch (error) {
    securityLogger.error('Error en detección de fraude:', error);
    next(); // Continuar en caso de error para no interrumpir servicio
  }
};

// ========================================
// MIDDLEWARE DE SANITIZACIÓN
// ========================================

export const sanitizeInput = (req: Request, res: Response, next: NextFunction) => {
  // Sanitizar body
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeObject(req.body);
  }

  // Sanitizar query params
  for (const [key, value] of Object.entries(req.query)) {
    if (typeof value === 'string') {
      req.query[key] = AttackProtection.sanitizeInput(value);
    }
  }

  next();
};

function sanitizeObject(obj: any): any {
  if (typeof obj === 'string') {
    return AttackProtection.sanitizeInput(obj);
  }
  
  if (Array.isArray(obj)) {
    return obj.map(sanitizeObject);
  }
  
  if (typeof obj === 'object' && obj !== null) {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(obj)) {
      sanitized[key] = sanitizeObject(value);
    }
    return sanitized;
  }
  
  return obj;
}

// ========================================
// MIDDLEWARE DE HEADERS DE SEGURIDAD
// ========================================

export const securityHeaders = helmet({
  contentSecurityPolicy: false, // Deshabilitado temporalmente para desarrollo
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  referrerPolicy: { policy: "strict-origin-when-cross-origin" }
});

// ========================================
// MIDDLEWARE DE CORS SEGURO
// ========================================

export const secureCors = cors({
  origin: true, // Permitir todos los orígenes en desarrollo
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-CSRF-Token']
});

// ========================================
// MIDDLEWARE DE LOGGING DE SEGURIDAD
// ========================================

export const securityLogging = expressWinston.logger({
  winstonInstance: securityLogger,
  meta: true,
  msg: "HTTP {{req.method}} {{req.url}}",
  expressFormat: true,
  colorize: false,
  ignoreRoute: function (req, res) {
    // No logear rutas estáticas para reducir ruido
    return req.url.startsWith('/assets/') || req.url.startsWith('/static/');
  },
  dynamicMeta: (req, res) => {
    return {
      userId: (req as any).user?.id,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      riskScore: (req as any).riskScore,
      responseTime: res.get('X-Response-Time')
    };
  }
});

// ========================================
// MIDDLEWARE DE MONITOREO DE INTEGRIDAD
// ========================================

export const integrityCheck = (req: Request, res: Response, next: NextFunction) => {
  // Verificar integridad de headers críticos
  const criticalHeaders = ['authorization', 'x-csrf-token', 'content-type'];
  
  for (const header of criticalHeaders) {
    const value = req.get(header);
    if (value && value.length > 10000) { // Headers muy largos pueden ser ataques
      SecurityAudit.logSecurityEvent({
        userId: (req as any).user?.id,
        action: 'OVERSIZED_HEADER',
        resource: req.path,
        result: 'BLOCKED',
        ipAddress: req.ip || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown',
        metadata: { header, length: value.length },
        severity: 'WARN'
      });

      return res.status(400).json({
        error: 'Header inválido',
        message: 'Tamaño de header excedido'
      });
    }
  }

  // Verificar tamaño del body
  const contentLength = parseInt(req.get('content-length') || '0');
  if (contentLength > 10 * 1024 * 1024) { // 10MB máximo
    return res.status(413).json({
      error: 'Payload muy grande',
      message: 'El tamaño de la solicitud excede el límite permitido'
    });
  }

  next();
};

// ========================================
// EXPORTAR TODOS LOS MIDDLEWARES
// ========================================

export {
  bruteForce,
  securityLogger
};

export default {
  rateLimits,
  validateInput,
  fraudDetection,
  sanitizeInput,
  securityHeaders,
  secureCors,
  securityLogging,
  integrityCheck,
  bruteForce
};