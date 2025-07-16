import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { 
  CheckCircle, 
  XCircle, 
  Clock, 
  Bell, 
  AlertTriangle, 
  FileText, 
  Users, 
  Calendar,
  DollarSign,
  BookOpen,
  CreditCard
} from 'lucide-react';

interface PendingApproval {
  id: number;
  campus_id: number;
  tenant_id: number;
  requested_by: number;
  approved_by: number | null;
  action_type: string;
  entity_type: string;
  entity_id: number;
  original_data: string;
  requested_data: string;
  reason: string;
  status: string;
  priority: string;
  approval_notes: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

interface ApprovalNotification {
  id: number;
  approval_id: number;
  recipient_id: number;
  notification_type: string;
  title: string;
  message: string;
  is_read: boolean;
  sent_at: string;
  additional_data: string | null;
}

export default function DemoAprobaciones() {
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([]);
  const [myRequests, setMyRequests] = useState<PendingApproval[]>([]);
  const [notifications, setNotifications] = useState<ApprovalNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("pending");
  const { toast } = useToast();

  // Función para obtener datos de las APIs
  const fetchData = async () => {
    setLoading(true);
    try {
      const [pendingResponse, requestsResponse, notificationsResponse] = await Promise.all([
        fetch('/api/approvals/pending'),
        fetch('/api/approvals/my-requests'),
        fetch('/api/approvals/notifications')
      ]);

      const pendingData = await pendingResponse.json();
      const requestsData = await requestsResponse.json();
      const notificationsData = await notificationsResponse.json();

      setPendingApprovals(pendingData);
      setMyRequests(requestsData);
      setNotifications(notificationsData);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast({
        title: "Error",
        description: "Error al cargar los datos del sistema de aprobaciones",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  // Cargar datos al montar el componente
  useEffect(() => {
    fetchData();
  }, []);

  // Función para obtener el icono según el tipo de acción
  const getActionIcon = (actionType: string) => {
    switch (actionType) {
      case 'modify_scholarship':
        return <BookOpen className="w-4 h-4" />;
      case 'modify_price':
        return <DollarSign className="w-4 h-4" />;
      case 'modify_late_fee':
        return <CreditCard className="w-4 h-4" />;
      case 'modify_concept':
        return <FileText className="w-4 h-4" />;
      case 'modify_payment_due_date':
        return <Calendar className="w-4 h-4" />;
      default:
        return <AlertTriangle className="w-4 h-4" />;
    }
  };

  // Función para obtener el color del badge según el estado
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
          <Clock className="w-3 h-3 mr-1" />
          Pendiente
        </Badge>;
      case 'approved':
        return <Badge variant="default" className="bg-green-100 text-green-800">
          <CheckCircle className="w-3 h-3 mr-1" />
          Aprobado
        </Badge>;
      case 'rejected':
        return <Badge variant="destructive">
          <XCircle className="w-3 h-3 mr-1" />
          Rechazado
        </Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  // Función para obtener color de prioridad
  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'text-red-600';
      case 'medium':
        return 'text-yellow-600';
      case 'low':
        return 'text-green-600';
      default:
        return 'text-gray-600';
    }
  };

  // Función para traducir tipo de acción
  const translateActionType = (actionType: string) => {
    const translations = {
      'modify_scholarship': 'Modificar Beca',
      'modify_price': 'Modificar Precio',
      'modify_late_fee': 'Modificar Recargo',
      'modify_concept': 'Modificar Concepto',
      'modify_payment_due_date': 'Modificar Fecha de Vencimiento',
      'delete_concept': 'Eliminar Concepto'
    };
    return translations[actionType as keyof typeof translations] || actionType;
  };

  // Función para formatear fecha
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Función para simular aprobación/rechazo
  const handleDecision = async (approvalId: number, decision: 'approved' | 'rejected') => {
    toast({
      title: `Solicitud ${decision === 'approved' ? 'Aprobada' : 'Rechazada'}`,
      description: `La solicitud #${approvalId} ha sido ${decision === 'approved' ? 'aprobada' : 'rechazada'} exitosamente`,
      variant: decision === 'approved' ? 'default' : 'destructive'
    });
    
    // Actualizar datos después de la decisión
    setTimeout(() => {
      fetchData();
    }, 1000);
  };

  // Función para crear nueva solicitud de demostración
  const createDemoRequest = () => {
    const demoTypes = [
      'modify_scholarship',
      'modify_price',
      'modify_late_fee',
      'modify_concept',
      'modify_payment_due_date'
    ];
    
    const randomType = demoTypes[Math.floor(Math.random() * demoTypes.length)];
    
    toast({
      title: "Solicitud Creada",
      description: `Se ha creado una nueva solicitud de tipo: ${translateActionType(randomType)}`,
      variant: "default"
    });
    
    // Actualizar datos después de crear
    setTimeout(() => {
      fetchData();
    }, 1000);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-lg font-medium">Cargando sistema de aprobaciones...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Sistema de Aprobaciones - Demo Completo
        </h1>
        <p className="text-gray-600">
          Demostración interactiva del sistema de validación para operaciones críticas
        </p>
      </div>

      {/* Estadísticas rápidas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Pendientes</p>
                <p className="text-2xl font-bold text-yellow-600">{pendingApprovals.length}</p>
              </div>
              <Clock className="w-8 h-8 text-yellow-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Mis Solicitudes</p>
                <p className="text-2xl font-bold text-blue-600">{myRequests.length}</p>
              </div>
              <FileText className="w-8 h-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Notificaciones</p>
                <p className="text-2xl font-bold text-green-600">{notifications.length}</p>
              </div>
              <Bell className="w-8 h-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Usuarios Activos</p>
                <p className="text-2xl font-bold text-purple-600">4</p>
              </div>
              <Users className="w-8 h-8 text-purple-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Botones de acción */}
      <div className="flex gap-4 mb-6">
        <Button onClick={fetchData} variant="outline">
          <Bell className="w-4 h-4 mr-2" />
          Actualizar Datos
        </Button>
        <Button onClick={createDemoRequest} className="bg-blue-600 hover:bg-blue-700">
          <FileText className="w-4 h-4 mr-2" />
          Crear Solicitud Demo
        </Button>
      </div>

      {/* Pestañas principales */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="pending">
            Aprobaciones Pendientes ({pendingApprovals.length})
          </TabsTrigger>
          <TabsTrigger value="requests">
            Mis Solicitudes ({myRequests.length})
          </TabsTrigger>
          <TabsTrigger value="notifications">
            Notificaciones ({notifications.length})
          </TabsTrigger>
        </TabsList>

        {/* Pestaña de Aprobaciones Pendientes */}
        <TabsContent value="pending" className="space-y-4">
          {pendingApprovals.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">No hay solicitudes pendientes</h3>
                <p className="text-gray-600">Todas las solicitudes han sido procesadas</p>
              </CardContent>
            </Card>
          ) : (
            pendingApprovals.map((approval) => (
              <Card key={approval.id} className="hover:shadow-lg transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {getActionIcon(approval.action_type)}
                      <div>
                        <CardTitle className="text-lg">
                          {translateActionType(approval.action_type)}
                        </CardTitle>
                        <CardDescription>
                          Solicitud #{approval.id} • {formatDate(approval.created_at)}
                        </CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={getPriorityColor(approval.priority)}>
                        {approval.priority.toUpperCase()}
                      </Badge>
                      {getStatusBadge(approval.status)}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div>
                      <p className="font-medium text-sm text-gray-600">Descripción:</p>
                      <p className="text-sm">{approval.reason}</p>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="font-medium text-sm text-gray-600">Valor Actual:</p>
                        <p className="text-sm bg-gray-100 p-2 rounded">
                          {JSON.parse(approval.original_data).value || 'N/A'}
                        </p>
                      </div>
                      <div>
                        <p className="font-medium text-sm text-gray-600">Valor Propuesto:</p>
                        <p className="text-sm bg-blue-50 p-2 rounded">
                          {JSON.parse(approval.requested_data).value || 'N/A'}
                        </p>
                      </div>
                    </div>

                    {approval.status === 'pending' && (
                      <div className="flex gap-2 pt-2">
                        <Button 
                          onClick={() => handleDecision(approval.id, 'approved')}
                          className="bg-green-600 hover:bg-green-700"
                          size="sm"
                        >
                          <CheckCircle className="w-4 h-4 mr-1" />
                          Aprobar
                        </Button>
                        <Button 
                          onClick={() => handleDecision(approval.id, 'rejected')}
                          variant="destructive"
                          size="sm"
                        >
                          <XCircle className="w-4 h-4 mr-1" />
                          Rechazar
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* Pestaña de Mis Solicitudes */}
        <TabsContent value="requests" className="space-y-4">
          {myRequests.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">No tienes solicitudes</h3>
                <p className="text-gray-600">Aún no has creado ninguna solicitud de aprobación</p>
              </CardContent>
            </Card>
          ) : (
            myRequests.map((request) => (
              <Card key={request.id} className="hover:shadow-lg transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {getActionIcon(request.action_type)}
                      <div>
                        <CardTitle className="text-lg">
                          {translateActionType(request.action_type)}
                        </CardTitle>
                        <CardDescription>
                          Solicitud #{request.id} • {formatDate(request.created_at)}
                        </CardDescription>
                      </div>
                    </div>
                    {getStatusBadge(request.status)}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div>
                      <p className="font-medium text-sm text-gray-600">Razón:</p>
                      <p className="text-sm">{request.reason}</p>
                    </div>
                    
                    {request.approval_notes && (
                      <div>
                        <p className="font-medium text-sm text-gray-600">Notas del Aprobador:</p>
                        <p className="text-sm bg-blue-50 p-2 rounded">{request.approval_notes}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* Pestaña de Notificaciones */}
        <TabsContent value="notifications" className="space-y-4">
          {notifications.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <Bell className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">No hay notificaciones</h3>
                <p className="text-gray-600">No tienes notificaciones pendientes</p>
              </CardContent>
            </Card>
          ) : (
            notifications.map((notification) => (
              <Card key={notification.id} className={`hover:shadow-lg transition-shadow ${
                !notification.is_read ? 'border-l-4 border-l-blue-500' : ''
              }`}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Bell className="w-5 h-5 text-blue-600" />
                      <div>
                        <CardTitle className="text-lg">{notification.title}</CardTitle>
                        <CardDescription>
                          {formatDate(notification.sent_at)}
                        </CardDescription>
                      </div>
                    </div>
                    {!notification.is_read && (
                      <Badge className="bg-blue-100 text-blue-800">Nueva</Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-700">{notification.message}</p>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}