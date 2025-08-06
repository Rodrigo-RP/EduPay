import { createContext, useContext, ReactNode } from 'react';
import { useRealTime } from '@/hooks/use-realtime';
import { Badge } from '@/components/ui/badge';
import { Wifi, WifiOff, AlertCircle, Loader2 } from 'lucide-react';

interface RealTimeContextType {
  isConnected: boolean;
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
  lastMessage: any;
  messageHistory: any[];
  connect: () => void;
  disconnect: () => void;
  sendMessage: (message: any) => boolean;
  stats: {
    reconnectAttempts: number;
    messagesReceived: number;
  };
}

const RealTimeContext = createContext<RealTimeContextType | null>(null);

export function useRealTimeContext() {
  const context = useContext(RealTimeContext);
  if (!context) {
    throw new Error('useRealTimeContext must be used within a RealTimeProvider');
  }
  return context;
}

interface RealTimeProviderProps {
  children: ReactNode;
  showStatusIndicator?: boolean;
}

export function RealTimeProvider({ children, showStatusIndicator = true }: RealTimeProviderProps) {
  const realTime = useRealTime({
    autoConnect: false, // Temporalmente deshabilitado mientras arreglamos la autenticación
    onConnect: () => {
      console.log('🔌 RealTimeProvider: Conectado');
    },
    onDisconnect: () => {
      console.log('🔌 RealTimeProvider: Desconectado');
    },
    onError: (error) => {
      console.error('❌ RealTimeProvider: Error', error);
    },
    onMessage: (message) => {
      console.log('📨 RealTimeProvider: Mensaje', message.type, message.action);
    }
  });

  return (
    <RealTimeContext.Provider value={realTime}>
      {children}
      {showStatusIndicator && <ConnectionStatusIndicator />}
    </RealTimeContext.Provider>
  );
}

function ConnectionStatusIndicator() {
  const { isConnected, connectionStatus } = useRealTimeContext();

  const getStatusConfig = () => {
    switch (connectionStatus) {
      case 'connected':
        return {
          icon: <Wifi className="h-3 w-3" />,
          text: 'Conectado',
          variant: 'default' as const,
          className: 'bg-green-500 text-white border-green-600'
        };
      case 'connecting':
        return {
          icon: <Loader2 className="h-3 w-3 animate-spin" />,
          text: 'Conectando...',
          variant: 'secondary' as const,
          className: 'bg-yellow-500 text-white border-yellow-600'
        };
      case 'error':
        return {
          icon: <AlertCircle className="h-3 w-3" />,
          text: 'Error',
          variant: 'destructive' as const,
          className: 'bg-red-500 text-white border-red-600'
        };
      default:
        return {
          icon: <WifiOff className="h-3 w-3" />,
          text: 'Desconectado',
          variant: 'outline' as const,
          className: 'bg-gray-500 text-white border-gray-600'
        };
    }
  };

  const config = getStatusConfig();

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <Badge 
        variant={config.variant}
        className={`flex items-center gap-1 px-2 py-1 text-xs font-medium ${config.className}`}
      >
        {config.icon}
        {config.text}
      </Badge>
    </div>
  );
}

// Hook simplificado para componentes que solo necesitan saber el estado de conexión
export function useConnectionStatus() {
  const { isConnected, connectionStatus } = useRealTimeContext();
  return { isConnected, connectionStatus };
}

// Hook para enviar actualizaciones en tiempo real
export function useRealTimeUpdates() {
  const { sendMessage } = useRealTimeContext();
  
  const notifyUserUpdate = (action: 'create' | 'update' | 'delete', data: any) => {
    return sendMessage({
      type: 'user_update',
      action,
      data,
      timestamp: new Date().toISOString()
    });
  };

  const notifyStudentUpdate = (action: 'create' | 'update' | 'delete', data: any) => {
    return sendMessage({
      type: 'student_update', 
      action,
      data,
      timestamp: new Date().toISOString()
    });
  };

  const notifyPaymentUpdate = (action: 'create' | 'update' | 'delete', data: any) => {
    return sendMessage({
      type: 'payment_update',
      action, 
      data,
      timestamp: new Date().toISOString()
    });
  };

  const notifyFamilyUpdate = (action: 'create' | 'update' | 'delete', data: any) => {
    return sendMessage({
      type: 'family_update',
      action,
      data, 
      timestamp: new Date().toISOString()
    });
  };

  return {
    notifyUserUpdate,
    notifyStudentUpdate,
    notifyPaymentUpdate,
    notifyFamilyUpdate
  };
}