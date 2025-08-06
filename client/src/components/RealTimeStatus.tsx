import { useConnectionStatus } from '@/components/RealTimeProvider';
import { Badge } from '@/components/ui/badge';
import { Wifi, WifiOff, AlertCircle, Loader2 } from 'lucide-react';

export function RealTimeStatus() {
  const { isConnected, connectionStatus } = useConnectionStatus();

  const getStatusConfig = () => {
    switch (connectionStatus) {
      case 'connected':
        return {
          icon: <Wifi className="h-3 w-3" />,
          text: 'Tiempo Real',
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
          text: 'Sin conexión',
          variant: 'outline' as const,
          className: 'bg-gray-500 text-white border-gray-600'
        };
    }
  };

  const config = getStatusConfig();

  return (
    <Badge 
      variant={config.variant}
      className={`flex items-center gap-1 px-2 py-1 text-xs font-medium ${config.className}`}
      title={`Estado de conexión en tiempo real: ${config.text}`}
    >
      {config.icon}
      {config.text}
    </Badge>
  );
}