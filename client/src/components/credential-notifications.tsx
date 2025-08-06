import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, Clock, CheckCircle2, X } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useState } from 'react';

interface CredentialNotification {
  id: number;
  credential_type: string;
  credential_name?: string | null;
  username?: string | null;
  expiration_date: string;
  days_until_expiration: number;
  urgency_level: 'high' | 'medium' | 'low';
}

interface NotificationStats {
  total: number;
  high_urgency: number;
  medium_urgency: number;
  low_urgency: number;
  expired: number;
}

const formatCredentialType = (type: string): string => {
  const types: Record<string, string> = {
    'firma_electronica': 'Firma Electrónica',
    'sellos_digitales': 'Sellos Digitales',
    'idse': 'IDSE',
    'tarjeta_patronal': 'Tarjeta Patronal',
    'infonavit': 'INFONAVIT',
    'otra': 'Otra'
  };
  return types[type] || type;
};

const getUrgencyColor = (urgency: string): "default" | "secondary" | "destructive" | "outline" => {
  switch (urgency) {
    case 'high': return 'destructive';
    case 'medium': return 'default';
    case 'low': return 'secondary';
    default: return 'secondary';
  }
};

const getUrgencyIcon = (urgency: string) => {
  switch (urgency) {
    case 'high': return <AlertTriangle className="h-4 w-4" />;
    case 'medium': return <Clock className="h-4 w-4" />;
    case 'low': return <CheckCircle2 className="h-4 w-4" />;
    default: return <Clock className="h-4 w-4" />;
  }
};

export function CredentialNotifications() {
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());
  const queryClient = useQueryClient();

  const { data: notifications = [], isLoading } = useQuery<CredentialNotification[]>({
    queryKey: ['/api/profile/credential-notifications'],
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  const { data: stats } = useQuery<NotificationStats>({
    queryKey: ['/api/profile/notification-stats'],
    refetchInterval: 30000,
  });

  const markAsSeenMutation = useMutation({
    mutationFn: async (credentialId: number) => {
      const response = await fetch(`/api/profile/credential-notifications/${credentialId}/seen`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json',
        },
      });
      if (!response.ok) throw new Error('Failed to mark notification as seen');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/profile/credential-notifications'] });
      queryClient.invalidateQueries({ queryKey: ['/api/profile/notification-stats'] });
    },
  });

  const handleDismiss = (credentialId: number) => {
    setDismissed(prev => new Set(Array.from(prev).concat(credentialId)));
    markAsSeenMutation.mutate(credentialId);
  };

  const activeNotifications = notifications.filter(n => !dismissed.has(n.id));

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Verificando credenciales...</div>;
  }

  if (activeNotifications.length === 0) {
    return (
      <Alert className="border-green-200 bg-green-50 dark:bg-green-950">
        <CheckCircle2 className="h-4 w-4 text-green-600" />
        <AlertDescription className="text-green-800 dark:text-green-200">
          Todas las credenciales institucionales están actualizadas
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      {/* Statistics Overview */}
      {stats && stats.total > 0 && (
        <div className="grid grid-cols-4 gap-2 text-center">
          <div className="p-2 bg-red-50 dark:bg-red-950 rounded-lg">
            <div className="text-lg font-semibold text-red-600">{stats.high_urgency}</div>
            <div className="text-xs text-red-500">Urgente</div>
          </div>
          <div className="p-2 bg-yellow-50 dark:bg-yellow-950 rounded-lg">
            <div className="text-lg font-semibold text-yellow-600">{stats.medium_urgency}</div>
            <div className="text-xs text-yellow-500">Medio</div>
          </div>
          <div className="p-2 bg-blue-50 dark:bg-blue-950 rounded-lg">
            <div className="text-lg font-semibold text-blue-600">{stats.low_urgency}</div>
            <div className="text-xs text-blue-500">Bajo</div>
          </div>
          <div className="p-2 bg-gray-50 dark:bg-gray-950 rounded-lg">
            <div className="text-lg font-semibold text-gray-600">{stats.expired}</div>
            <div className="text-xs text-gray-500">Vencidas</div>
          </div>
        </div>
      )}

      {/* Notification Cards */}
      <div className="space-y-3">
        {activeNotifications.map((notification) => (
          <Card key={notification.id} className="relative">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">
                  {formatCredentialType(notification.credential_type)}
                  {notification.credential_name && (
                    <span className="text-muted-foreground"> - {notification.credential_name}</span>
                  )}
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDismiss(notification.id)}
                  className="h-6 w-6 p-0"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  {notification.username && (
                    <div className="text-xs text-muted-foreground">
                      Usuario: {notification.username}
                    </div>
                  )}
                  <div className="text-xs text-muted-foreground">
                    Vence: {new Date(notification.expiration_date).toLocaleDateString('es-MX')}
                  </div>
                  <div className="text-sm font-medium">
                    {notification.days_until_expiration < 0 
                      ? `Venció hace ${Math.abs(notification.days_until_expiration)} días`
                      : `${notification.days_until_expiration} días restantes`
                    }
                  </div>
                </div>
                <Badge variant={getUrgencyColor(notification.urgency_level)}>
                  {getUrgencyIcon(notification.urgency_level)}
                  <span className="ml-1 capitalize">{notification.urgency_level}</span>
                </Badge>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export function CredentialNotificationsBadge() {
  const { data: stats } = useQuery<NotificationStats>({
    queryKey: ['/api/profile/notification-stats'],
    refetchInterval: 30000,
  });

  if (!stats || stats.total === 0) return null;

  return (
    <Badge variant="destructive" className="ml-2">
      {stats.total}
    </Badge>
  );
}