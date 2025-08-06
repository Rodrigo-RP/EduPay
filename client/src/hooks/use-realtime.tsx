import { useEffect, useRef, useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from './use-auth';
import { useToast } from './use-toast';

interface RealTimeMessage {
  type: 'user_update' | 'student_update' | 'family_update' | 'payment_update' | 'report_update' | 'system_notification' | 'auth_success' | 'auth_error' | 'error' | 'pong';
  action?: 'create' | 'update' | 'delete' | 'export';
  data?: any;
  metadata?: {
    campus_id: number;
    tenant_id: number;
    created_by: number;
    timestamp: string;
  };
  message?: string;
  user?: any;
}

interface UseRealTimeOptions {
  autoConnect?: boolean;
  onMessage?: (message: RealTimeMessage) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Event) => void;
}

export function useRealTime(options: UseRealTimeOptions = {}) {
  const { autoConnect = true, onMessage, onConnect, onDisconnect, onError } = options;
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [lastMessage, setLastMessage] = useState<RealTimeMessage | null>(null);
  const [messageHistory, setMessageHistory] = useState<RealTimeMessage[]>([]);
  
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;

  const connect = useCallback(() => {
    if (!user || wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    console.log('🔌 Conectando WebSocket...');
    setConnectionStatus('connecting');

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/realtime`;
    
    try {
      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = () => {
        console.log('✅ WebSocket conectado');
        setIsConnected(true);
        setConnectionStatus('connected');
        reconnectAttempts.current = 0;
        
        // Autenticar usuario
        const token = localStorage.getItem('auth_token');
        if (token) {
          wsRef.current?.send(JSON.stringify({
            type: 'auth',
            token
          }));
        }

        // Configurar heartbeat
        heartbeatIntervalRef.current = setInterval(() => {
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'ping' }));
          }
        }, 30000);

        onConnect?.();
      };

      wsRef.current.onmessage = (event) => {
        try {
          const message: RealTimeMessage = JSON.parse(event.data);
          console.log('📨 Mensaje recibido:', message.type, message.action);
          
          setLastMessage(message);
          setMessageHistory(prev => [...prev.slice(-99), message]); // Mantener últimos 100 mensajes
          
          handleMessage(message);
          onMessage?.(message);
        } catch (error) {
          console.error('❌ Error parseando mensaje WebSocket:', error);
        }
      };

      wsRef.current.onclose = (event) => {
        console.log('🔌 WebSocket desconectado:', event.code, event.reason);
        setIsConnected(false);
        setConnectionStatus('disconnected');
        
        if (heartbeatIntervalRef.current) {
          clearInterval(heartbeatIntervalRef.current);
          heartbeatIntervalRef.current = null;
        }

        onDisconnect?.();

        // Intentar reconectar si no fue un cierre intencional
        if (event.code !== 1000 && reconnectAttempts.current < maxReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
          console.log(`🔄 Reintentando conexión en ${delay}ms (intento ${reconnectAttempts.current + 1}/${maxReconnectAttempts})`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttempts.current++;
            connect();
          }, delay);
        } else if (reconnectAttempts.current >= maxReconnectAttempts) {
          console.log('❌ Máximo de intentos de reconexión alcanzado');
          setConnectionStatus('error');
        }
      };

      wsRef.current.onerror = (error) => {
        console.error('❌ Error en WebSocket:', error);
        setConnectionStatus('error');
        onError?.(error);
      };

    } catch (error) {
      console.error('❌ Error creando WebSocket:', error);
      setConnectionStatus('error');
    }
  }, [user, onConnect, onDisconnect, onError, onMessage]);

  const disconnect = useCallback(() => {
    console.log('🔌 Desconectando WebSocket...');
    
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close(1000, 'Desconexión intencional');
      wsRef.current = null;
    }
    
    setIsConnected(false);
    setConnectionStatus('disconnected');
    reconnectAttempts.current = 0;
  }, []);

  const handleMessage = useCallback((message: RealTimeMessage) => {
    switch (message.type) {
      case 'auth_success':
        console.log('✅ Autenticación exitosa');
        // Suscribirse a actualizaciones del campus
        wsRef.current?.send(JSON.stringify({
          type: 'subscribe_campus'
        }));
        break;

      case 'auth_error':
        console.log('❌ Error de autenticación:', message.message);
        toast({
          title: "Error de conexión",
          description: "Sesión expirada. Por favor, inicia sesión nuevamente.",
          variant: "destructive",
        });
        break;

      case 'user_update':
        console.log('👤 Actualización de usuario:', message.action);
        queryClient.invalidateQueries({ queryKey: ['/api/users'] });
        
        if (message.action === 'create') {
          toast({
            title: "Nuevo usuario",
            description: `Se agregó un nuevo usuario al sistema.`,
          });
        } else if (message.action === 'update') {
          toast({
            title: "Usuario actualizado", 
            description: `Información de usuario modificada.`,
          });
        } else if (message.action === 'delete') {
          toast({
            title: "Usuario eliminado",
            description: `Un usuario fue removido del sistema.`,
            variant: "destructive",
          });
        }
        break;

      case 'student_update':
        console.log('🎓 Actualización de estudiante:', message.action);
        queryClient.invalidateQueries({ queryKey: ['/api/students'] });
        queryClient.invalidateQueries({ queryKey: ['/api/admin/students'] });
        
        if (message.action === 'create') {
          toast({
            title: "Nuevo estudiante",
            description: `Se registró un nuevo estudiante.`,
          });
        } else if (message.action === 'update') {
          toast({
            title: "Estudiante actualizado",
            description: `Información de estudiante modificada.`,
          });
        } else if (message.action === 'delete') {
          toast({
            title: "Estudiante dado de baja", 
            description: `Un estudiante fue dado de baja del sistema.`,
            variant: "destructive",
          });
        }
        break;

      case 'family_update':
        console.log('👨‍👩‍👧‍👦 Actualización de familia:', message.action);
        queryClient.invalidateQueries({ queryKey: ['/api/families'] });
        
        if (message.action === 'create') {
          toast({
            title: "Nueva familia",
            description: `Se registró una nueva familia.`,
          });
        } else if (message.action === 'update') {
          toast({
            title: "Familia actualizada",
            description: `Información de familia modificada.`,
          });
        }
        break;

      case 'payment_update':
        console.log('💰 Actualización de pago:', message.action);
        queryClient.invalidateQueries({ queryKey: ['/api/payments'] });
        queryClient.invalidateQueries({ queryKey: ['/api/admin/dashboard'] });
        
        if (message.action === 'create') {
          toast({
            title: "Nuevo pago registrado",
            description: `Se procesó un nuevo pago.`,
          });
        } else if (message.action === 'update') {
          toast({
            title: "Pago actualizado",
            description: `Información de pago modificada.`,
          });
        }
        break;

      case 'report_update':
        console.log('📊 Reporte generado:', message.action);
        if (message.action === 'export') {
          toast({
            title: "Reporte generado",
            description: `Se generó un nuevo reporte.`,
          });
        }
        break;

      case 'system_notification':
        console.log('🔔 Notificación del sistema');
        if (message.data?.title && message.data?.description) {
          toast({
            title: message.data.title,
            description: message.data.description,
            variant: message.data.variant || "default",
          });
        }
        break;

      case 'pong':
        // Respuesta al ping, no hacer nada
        break;

      default:
        console.log('❓ Mensaje no manejado:', message.type);
    }
  }, [queryClient, toast]);

  const sendMessage = useCallback((message: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
      return true;
    } else {
      console.warn('⚠️ WebSocket no está conectado, no se puede enviar mensaje');
      return false;
    }
  }, []);

  // Efecto para auto-conectar
  useEffect(() => {
    if (autoConnect && user) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [autoConnect, user, connect, disconnect]);

  // Cleanup al desmontar
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    isConnected,
    connectionStatus,
    lastMessage,
    messageHistory,
    connect,
    disconnect,
    sendMessage,
    stats: {
      reconnectAttempts: reconnectAttempts.current,
      messagesReceived: messageHistory.length
    }
  };
}