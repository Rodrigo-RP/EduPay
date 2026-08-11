import { WebSocket, WebSocketServer } from 'ws';
import { Server } from 'http';
import jwt from 'jsonwebtoken';
import { db } from './db';
import { users } from '@shared/schema';
import { eq } from 'drizzle-orm';

interface AuthenticatedSocket extends WebSocket {
  user?: {
    id: number;
    campus_id: number;
    tenant_id: number;
    role: string;
    email: string;
  };
  isAlive?: boolean;
}

interface RealTimeMessage {
  type: 'user_update' | 'student_update' | 'family_update' | 'payment_update' | 'report_update' | 'system_notification';
  action: 'create' | 'update' | 'delete' | 'export';
  data: any;
  metadata: {
    campus_id: number;
    tenant_id: number;
    created_by: number;
    timestamp: string;
  };
}

class WebSocketManager {
  private wss: WebSocketServer | null = null;
  private clients: Map<number, AuthenticatedSocket[]> = new Map(); // user_id -> sockets
  private campusClients: Map<number, Set<number>> = new Map(); // campus_id -> user_ids
  private connectionAttempts: Map<string, number> = new Map(); // IP -> connection count per minute

  initialize(server: Server) {
    this.wss = new WebSocketServer({ 
      server,
      path: '/ws/realtime'  // Use a specific path to avoid conflicts with Vite's HMR WebSocket
    });
    
    this.wss.on('connection', (ws: AuthenticatedSocket, req) => {
      // Rate limiting by IP
      const clientIP = req.socket.remoteAddress || 'unknown';
      const currentTime = Math.floor(Date.now() / 60000); // Current minute
      const connectionKey = `${clientIP}-${currentTime}`;
      
      const currentConnections = this.connectionAttempts.get(connectionKey) || 0;
      const maxConnections = process.env.NODE_ENV === 'development' ? 100 : 50;
      if (currentConnections > maxConnections) {
        console.log(`🚫 Rate limit exceeded for IP: ${clientIP} (${currentConnections}/${maxConnections})`);
        ws.close(1013, 'Too many connections');
        return;
      }
      
      this.connectionAttempts.set(connectionKey, currentConnections + 1);
      
      // Clean up old connection counts (older than 2 minutes)
      const cutoff = currentTime - 2;
      this.connectionAttempts.forEach((value, key) => {
        const keyTime = parseInt(key.split('-').pop() || '0');
        if (keyTime < cutoff) {
          this.connectionAttempts.delete(key);
        }
      });

      console.log('🔌 Nueva conexión WebSocket');
      ws.isAlive = true;
      
      // Heartbeat para mantener conexión viva
      ws.on('pong', () => {
        ws.isAlive = true;
      });

      // Manejo de mensajes
      ws.on('message', async (message: string) => {
        try {
          const data = JSON.parse(message);
          await this.handleMessage(ws, data);
        } catch (error) {
          console.error('❌ Error procesando mensaje WebSocket:', error);
          ws.send(JSON.stringify({ 
            type: 'error', 
            message: 'Formato de mensaje inválido' 
          }));
        }
      });

      // Cleanup al cerrar conexión
      ws.on('close', () => {
        console.log('🔌 Conexión WebSocket cerrada');
        this.removeClient(ws);
      });

      ws.on('error', (error) => {
        console.error('❌ Error en WebSocket:', error);
        this.removeClient(ws);
      });
    });

    // Heartbeat interval para detectar conexiones muertas
    setInterval(() => {
      this.wss?.clients.forEach((ws: AuthenticatedSocket) => {
        if (!ws.isAlive) {
          console.log('💀 Terminando conexión inactiva');
          this.removeClient(ws); // Limpiar referencias antes de terminar
          ws.terminate();
          return;
        }
        ws.isAlive = false;
        ws.ping();
      });
    }, 30000); // Cada 30 segundos

    console.log('✅ WebSocket Manager inicializado');
  }

  private async handleMessage(ws: AuthenticatedSocket, data: any) {
    switch (data.type) {
      case 'auth':
        await this.authenticateUser(ws, data.token);
        break;
      case 'ping':
        ws.send(JSON.stringify({ type: 'pong' }));
        break;
      case 'subscribe_campus':
        if (ws.user) {
          this.subscribeToCampus(ws.user.id, ws.user.campus_id);
        }
        break;
      default:
        ws.send(JSON.stringify({ 
          type: 'error', 
          message: 'Tipo de mensaje no reconocido' 
        }));
    }
  }

  private async authenticateUser(ws: AuthenticatedSocket, token: string) {
    try {
      if (!token) {
        throw new Error('Token no proporcionado');
      }

      const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-key';
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      
      // Validar estructura del token
      if (!decoded || !decoded.id || typeof decoded.id !== 'number') {
        throw new Error('Token inválido: estructura incorrecta');
      }
      
      // Buscar usuario en base de datos
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, decoded.id))
        .limit(1);

      if (!user || !user.is_active || !user.campus_id || !user.tenant_id) {
        ws.send(JSON.stringify({ 
          type: 'auth_error', 
          message: 'Usuario no encontrado, inactivo o datos incompletos' 
        }));
        ws.close();
        return;
      }

      // Asignar datos de usuario a la conexión
      ws.user = {
        id: user.id,
        campus_id: user.campus_id!,
        tenant_id: user.tenant_id!,
        role: user.role,
        email: user.email
      };

      // Registrar cliente
      this.addClient(ws);

      // Confirmar autenticación
      ws.send(JSON.stringify({ 
        type: 'auth_success', 
        user: {
          id: user.id,
          role: user.role,
          campus_id: user.campus_id
        }
      }));

      console.log(`✅ Usuario autenticado: user_id=${user.id} role=${user.role}`);

    } catch (error) {
      console.error('❌ Error autenticando usuario:', error);
      ws.send(JSON.stringify({ 
        type: 'auth_error', 
        message: 'Token inválido' 
      }));
      ws.close();
    }
  }

  private addClient(ws: AuthenticatedSocket) {
    if (!ws.user) return;

    const userId = ws.user.id;
    const campusId = ws.user.campus_id;

    // Agregar a lista de clientes del usuario
    if (!this.clients.has(userId)) {
      this.clients.set(userId, []);
    }
    this.clients.get(userId)!.push(ws);

    // Agregar a lista de usuarios del campus
    if (!this.campusClients.has(campusId)) {
      this.campusClients.set(campusId, new Set());
    }
    this.campusClients.get(campusId)!.add(userId);

    console.log(`📊 Cliente agregado: Usuario ${userId}, Campus ${campusId}`);
  }

  private removeClient(ws: AuthenticatedSocket) {
    if (!ws.user) return;

    const userId = ws.user.id;
    const campusId = ws.user.campus_id;

    // Remover de lista de clientes del usuario
    const userSockets = this.clients.get(userId);
    if (userSockets) {
      const index = userSockets.indexOf(ws);
      if (index > -1) {
        userSockets.splice(index, 1);
        if (userSockets.length === 0) {
          this.clients.delete(userId);
          // Si no hay más sockets, remover del campus
          this.campusClients.get(campusId)?.delete(userId);
        }
      }
    }

    console.log(`📊 Cliente removido: Usuario ${userId}, Campus ${campusId}`);
  }

  private subscribeToCampus(userId: number, campusId: number) {
    if (!this.campusClients.has(campusId)) {
      this.campusClients.set(campusId, new Set());
    }
    this.campusClients.get(campusId)!.add(userId);
    console.log(`📡 Usuario ${userId} suscrito a campus ${campusId}`);
  }

  // Métodos públicos para enviar actualizaciones
  public broadcastToRole(message: RealTimeMessage, targetRole: string, campusId?: number) {
    let targetUsers: number[] = [];

    // Filtrar usuarios por rol y campus si es necesario
    this.clients.forEach((sockets, userId) => {
      const socket = sockets[0]; // Tomar el primer socket del usuario
      if (socket?.user?.role === targetRole) {
        if (!campusId || socket.user.campus_id === campusId) {
          targetUsers.push(userId);
        }
      }
    });

    this.sendToUsers(message, targetUsers);
  }

  public broadcastToCampus(message: RealTimeMessage, campusId: number) {
    const campusUsers = this.campusClients.get(campusId);
    if (campusUsers) {
      this.sendToUsers(message, Array.from(campusUsers));
    }
  }

  public broadcastToUser(message: RealTimeMessage, userId: number) {
    this.sendToUsers(message, [userId]);
  }

  public broadcastToAllWithPermission(message: RealTimeMessage, requiredPermission: string) {
    const targetUsers: number[] = [];

    this.clients.forEach((sockets, userId) => {
      const socket = sockets[0];
      if (socket?.user && this.userHasPermission(socket.user, requiredPermission)) {
        targetUsers.push(userId);
      }
    });

    this.sendToUsers(message, targetUsers);
  }

  private sendToUsers(message: RealTimeMessage, userIds: number[]) {
    const messageStr = JSON.stringify(message);
    let sentCount = 0;
    let errorCount = 0;

    userIds.forEach(userId => {
      const userSockets = this.clients.get(userId);
      if (userSockets) {
        userSockets.forEach(socket => {
          try {
            if (socket.readyState === WebSocket.OPEN) {
              socket.send(messageStr);
              sentCount++;
            } else if (socket.readyState === WebSocket.CLOSED || socket.readyState === WebSocket.CLOSING) {
              // Remove dead connections
              this.removeClient(socket);
            }
          } catch (error) {
            console.error(`❌ Error enviando mensaje a usuario ${userId}:`, error);
            errorCount++;
            // Remove problematic connection
            this.removeClient(socket);
          }
        });
      }
    });

    console.log(`📡 Mensaje enviado a ${sentCount} conexiones: ${message.type} - ${message.action}${errorCount > 0 ? ` (${errorCount} errores)` : ''}`);
  }

  private userHasPermission(user: any, permission: string): boolean {
    // Definir permisos por rol
    const rolePermissions: { [key: string]: string[] } = {
      'administrador_general': ['all'],
      'administrador_campus': ['users', 'students', 'families', 'payments', 'reports'],
      'contador_general': ['payments', 'reports', 'financial'],
      'auxiliar_contable': ['payments', 'reports'],
      'admisiones': ['students', 'families', 'enrollments'],
      'asistente': ['students', 'families', 'basic_payments'],
      'caja': ['payments', 'charges']
    };

    const userPermissions = rolePermissions[user.role] || [];
    return userPermissions.includes('all') || userPermissions.includes(permission);
  }

  // Métodos de utilidad específicos para diferentes tipos de actualizaciones
  public notifyUserUpdate(data: any, action: 'create' | 'update' | 'delete', metadata: any) {
    const message: RealTimeMessage = {
      type: 'user_update',
      action,
      data,
      metadata: {
        ...metadata,
        timestamp: new Date().toISOString()
      }
    };

    // Notificar a administradores del campus
    this.broadcastToRole(message, 'administrador_general');
    this.broadcastToRole(message, 'administrador_campus', metadata.campus_id);
  }

  public notifyStudentUpdate(data: any, action: 'create' | 'update' | 'delete', metadata: any) {
    const message: RealTimeMessage = {
      type: 'student_update',
      action,
      data,
      metadata: {
        ...metadata,
        timestamp: new Date().toISOString()
      }
    };

    // Notificar a usuarios con permisos de estudiantes
    this.broadcastToAllWithPermission(message, 'students');
  }

  public notifyPaymentUpdate(data: any, action: 'create' | 'update' | 'delete', metadata: any) {
    const message: RealTimeMessage = {
      type: 'payment_update',
      action,
      data,
      metadata: {
        ...metadata,
        timestamp: new Date().toISOString()
      }
    };

    // Notificar a usuarios con permisos de pagos
    this.broadcastToAllWithPermission(message, 'payments');
  }

  public notifyReportGenerated(data: any, metadata: any) {
    const message: RealTimeMessage = {
      type: 'report_update',
      action: 'export',
      data,
      metadata: {
        ...metadata,
        timestamp: new Date().toISOString()
      }
    };

    // Notificar a usuarios con permisos de reportes
    this.broadcastToAllWithPermission(message, 'reports');
  }

  public notifyFamilyUpdate(data: any, action: 'create' | 'update' | 'delete', metadata: any) {
    const message: RealTimeMessage = {
      type: 'family_update',
      action,
      data,
      metadata: {
        ...metadata,
        timestamp: new Date().toISOString()
      }
    };

    // Notificar a usuarios con permisos de familias
    this.broadcastToAllWithPermission(message, 'families');
  }

  public notifySystemUpdate(data: any, metadata: any) {
    const message: RealTimeMessage = {
      type: 'system_notification',
      action: 'update',
      data,
      metadata: {
        ...metadata,
        timestamp: new Date().toISOString()
      }
    };

    // Notificar a todos los usuarios del campus
    this.broadcastToCampus(message, metadata.campus_id);
  }

  public getStats() {
    return {
      totalConnections: this.wss?.clients.size || 0,
      authenticatedUsers: this.clients.size,
      campusCount: this.campusClients.size,
      campusBreakdown: Array.from(this.campusClients.entries()).map(([campusId, users]) => ({
        campusId,
        userCount: users.size
      }))
    };
  }
}

export const wsManager = new WebSocketManager();