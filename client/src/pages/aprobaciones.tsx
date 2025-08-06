import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  CheckCircle, 
  XCircle, 
  Clock, 
  AlertCircle, 
  Eye, 
  MessageSquare,
  Shield,
  FileText,
  Calendar,
  User
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface PendingApproval {
  id: number;
  campus_id: number;
  requested_by: number;
  action_type: string;
  action_description?: string;
  entity_type: string;
  entity_id: number;
  original_data: string;
  requested_data: string;
  reason: string;
  status: string;
  priority: string;
  created_at: string;
  updated_at: string;
  approved_by?: number;
  approval_notes?: string;
  requester_name?: string;
  requester_email?: string;
  requester_role?: string;
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
  read_at?: string;
  additional_data?: string;
}

export default function Aprobaciones() {
  const [selectedApproval, setSelectedApproval] = useState<PendingApproval | null>(null);
  const [showDecisionDialog, setShowDecisionDialog] = useState(false);
  const [decisionNotes, setDecisionNotes] = useState("");
  const [currentDecision, setCurrentDecision] = useState<'approved' | 'rejected' | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const getTranslatedFieldName = (key: string) => {
    const translations: { [key: string]: string } = {
      'percentage': 'Porcentaje',
      'student': 'Estudiante',
      'concept': 'Concepto',
      'amount': 'Monto',
      'price': 'Precio',
      'description': 'Descripción',
      'date': 'Fecha',
      'status': 'Estado',
      'reason': 'Razón',
      'type': 'Tipo',
      'value': 'Valor',
      'name': 'Nombre',
      'email': 'Correo',
      'role': 'Rol'
    };
    return translations[key.toLowerCase()] || key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  // Fetch pending approvals (as approver)
  const { data: pendingApprovals, isLoading: loadingPending } = useQuery({
    queryKey: ['/api/approvals/pending'],
    refetchInterval: 10000 // Refresh every 10 seconds
  });

  // Fetch user's own requests
  const { data: myRequests, isLoading: loadingRequests } = useQuery({
    queryKey: ['/api/approvals/my-requests'],
    refetchInterval: 10000
  });

  // Fetch notifications
  const { data: notifications, isLoading: loadingNotifications } = useQuery({
    queryKey: ['/api/approvals/notifications'],
    refetchInterval: 5000
  });

  // Fetch all approvals history (for admin and requesters)
  const { data: allHistory, isLoading: loadingHistory } = useQuery({
    queryKey: ['/api/approvals/history'],
    refetchInterval: 10000
  });

  // Decision mutation
  const decisionMutation = useMutation({
    mutationFn: async (data: { approval_id: number; decision: string; notes?: string }) => {
      return await apiRequest('POST', '/api/approvals/decision', data);
    },
    onSuccess: (data: any) => {
      toast({
        title: "Decisión procesada",
        description: data.message || "Decisión procesada exitosamente",
        variant: "default"
      });
      queryClient.invalidateQueries({ queryKey: ['/api/approvals/pending'] });
      queryClient.invalidateQueries({ queryKey: ['/api/approvals/my-requests'] });
      queryClient.invalidateQueries({ queryKey: ['/api/approvals/notifications'] });
      setShowDecisionDialog(false);
      setSelectedApproval(null);
      setDecisionNotes("");
      setCurrentDecision(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Error procesando la decisión",
        variant: "destructive"
      });
    }
  });

  // Mark notification as read
  const markAsReadMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest('POST', `/api/approvals/notifications/${id}/read`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/approvals/notifications'] });
    }
  });

  const handleDecision = (approval: PendingApproval, decision: 'approved' | 'rejected') => {
    setSelectedApproval(approval);
    setCurrentDecision(decision);
    setShowDecisionDialog(true);
  };

  const confirmDecision = () => {
    if (!selectedApproval || !currentDecision) return;
    
    decisionMutation.mutate({
      approval_id: selectedApproval.id,
      decision: currentDecision,
      notes: decisionNotes || undefined
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-300">
          <Clock className="w-3 h-3 mr-1" />
          Pendiente
        </Badge>;
      case 'approved':
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">
          <CheckCircle className="w-3 h-3 mr-1" />
          Aprobado
        </Badge>;
      case 'rejected':
        return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-300">
          <XCircle className="w-3 h-3 mr-1" />
          Rechazado
        </Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getActionTypeLabel = (actionType: string) => {
    const labels: { [key: string]: string } = {
      'modify_scholarship': 'Modificar Beca',
      'modify_late_fee': 'Modificar Recargo',
      'modify_price': 'Modificar Precio',
      'modify_payment_due_date': 'Modificar Fecha de Vencimiento',
      'delete_concept': 'Eliminar Concepto',
      'modify_concept': 'Modificar Concepto',
      'delete_charge': 'Eliminar Cargo',
      'modify_charge_amount': 'Modificar Monto de Cargo',
      'cancel_payment': 'Cancelar Pago',
      'refund_payment': 'Reembolsar Pago'
    };
    return labels[actionType] || actionType;
  };

  const getNotificationTypeIcon = (type: string) => {
    switch (type) {
      case 'approval_granted':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'approval_denied':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'approval_request':
        return <AlertCircle className="w-4 h-4 text-yellow-500" />;
      default:
        return <MessageSquare className="w-4 h-4 text-blue-500" />;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sistema de Aprobaciones</h1>
          <p className="text-gray-600">Gestiona las solicitudes de aprobación de cambios críticos</p>
        </div>
        <div className="flex items-center space-x-2">
          <Shield className="w-5 h-5 text-blue-500" />
          <span className="text-sm text-gray-600">Control de Cambios Críticos</span>
        </div>
      </div>

      <Tabs defaultValue="pending" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="pending" className="flex items-center space-x-2">
            <Clock className="w-4 h-4" />
            <span>Pendientes de Aprobación</span>
            {pendingApprovals && Array.isArray(pendingApprovals) && pendingApprovals.length > 0 && (
              <Badge variant="secondary" className="ml-2">
                {pendingApprovals.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="requests" className="flex items-center space-x-2">
            <FileText className="w-4 h-4" />
            <span>Mis Solicitudes</span>
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center space-x-2">
            <FileText className="w-4 h-4" />
            <span>Historial Completo</span>
          </TabsTrigger>
          <TabsTrigger value="notifications" className="flex items-center space-x-2">
            <MessageSquare className="w-4 h-4" />
            <span>Notificaciones</span>
            {notifications && Array.isArray(notifications) && notifications.filter((n: ApprovalNotification) => !n.is_read).length > 0 && (
              <Badge variant="destructive" className="ml-2">
                {notifications.filter((n: ApprovalNotification) => !n.is_read).length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Clock className="w-5 h-5" />
                <span>Solicitudes Pendientes de Aprobación</span>
              </CardTitle>
              <CardDescription>
                Revisa y aprueba las solicitudes de cambios críticos en el sistema
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingPending ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                  <p className="mt-2 text-gray-600">Cargando aprobaciones...</p>
                </div>
              ) : !pendingApprovals || !Array.isArray(pendingApprovals) || pendingApprovals.length === 0 ? (
                <div className="text-center py-8">
                  <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
                  <p className="text-gray-600">No hay solicitudes pendientes de aprobación</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tipo de Acción</TableHead>
                      <TableHead>Solicitante</TableHead>
                      <TableHead>Datos Originales</TableHead>
                      <TableHead>Datos Solicitados</TableHead>
                      <TableHead>Prioridad</TableHead>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Array.isArray(pendingApprovals) && pendingApprovals.map((approval: PendingApproval) => {
                      let originalData, requestedData;
                      try {
                        originalData = JSON.parse(approval.original_data);
                        requestedData = JSON.parse(approval.requested_data);
                      } catch {
                        originalData = {};
                        requestedData = {};
                      }
                      
                      return (
                        <TableRow key={approval.id}>
                          <TableCell className="font-medium">
                            {getActionTypeLabel(approval.action_type)}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="font-medium">{approval.requester_name || 'Usuario Desconocido'}</span>
                              <span className="text-sm text-gray-500">{approval.requester_email}</span>
                              <Badge variant="outline" className="w-fit text-xs mt-1">
                                {approval.requester_role || 'Sin rol'}
                              </Badge>
                            </div>
                          </TableCell>
                          <TableCell className="text-gray-600 max-w-32">
                            <div className="text-sm">
                              {Object.entries(originalData).map(([key, value]) => {
                                const translatedKey = getTranslatedFieldName(key);
                                return (
                                  <div key={key} className="truncate">
                                    <span className="font-medium">{translatedKey}:</span> {String(value)}
                                  </div>
                                );
                              })}
                            </div>
                          </TableCell>
                          <TableCell className="font-medium text-blue-600 max-w-32">
                            <div className="text-sm">
                              {Object.entries(requestedData).map(([key, value]) => {
                                const translatedKey = getTranslatedFieldName(key);
                                return (
                                  <div key={key} className="truncate">
                                    <span className="font-semibold">{translatedKey}:</span> {String(value)}
                                  </div>
                                );
                              })}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={approval.priority === 'high' ? 'destructive' : approval.priority === 'medium' ? 'default' : 'secondary'}>
                              {approval.priority === 'high' ? 'Alta' : approval.priority === 'medium' ? 'Media' : 'Baja'}
                            </Badge>
                          </TableCell>
                          <TableCell>{formatDate(approval.created_at)}</TableCell>
                          <TableCell>{getStatusBadge(approval.status)}</TableCell>
                          <TableCell>
                            {approval.status === 'pending' && (
                              <div className="flex flex-col space-y-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-blue-600 border-blue-300 hover:bg-blue-50"
                                  onClick={() => setSelectedApproval(approval)}
                                >
                                  <Eye className="w-4 h-4 mr-1" />
                                  Ver Observaciones
                                </Button>
                                <div className="flex space-x-1">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="text-green-600 border-green-300 hover:bg-green-50"
                                    onClick={() => handleDecision(approval, 'approved')}
                                  >
                                    <CheckCircle className="w-4 h-4 mr-1" />
                                    Aprobar
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="text-red-600 border-red-300 hover:bg-red-50"
                                    onClick={() => handleDecision(approval, 'rejected')}
                                  >
                                    <XCircle className="w-4 h-4 mr-1" />
                                    Rechazar
                                  </Button>
                                </div>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="requests" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <FileText className="w-5 h-5" />
                <span>Mis Solicitudes</span>
              </CardTitle>
              <CardDescription>
                Historial de tus solicitudes de aprobación enviadas
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingRequests ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                  <p className="mt-2 text-gray-600">Cargando solicitudes...</p>
                </div>
              ) : !myRequests || !Array.isArray(myRequests) || myRequests.length === 0 ? (
                <div className="text-center py-8">
                  <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600">No has enviado solicitudes de aprobación</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tipo de Acción</TableHead>
                      <TableHead>Descripción</TableHead>
                      <TableHead>Motivo</TableHead>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Array.isArray(myRequests) && myRequests.map((request: PendingApproval) => (
                      <TableRow key={request.id}>
                        <TableCell className="font-medium">
                          {getActionTypeLabel(request.action_type)}
                        </TableCell>
                        <TableCell>{request.action_description}</TableCell>
                        <TableCell>{request.reason}</TableCell>
                        <TableCell>{formatDate(request.created_at)}</TableCell>
                        <TableCell>{getStatusBadge(request.status)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Calendar className="w-5 h-5" />
                <span>Historial Completo de Aprobaciones</span>
              </CardTitle>
              <CardDescription>
                Historial completo de todas las solicitudes con mensajes y observaciones del administrador
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingHistory ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                  <p className="mt-2 text-gray-600">Cargando historial...</p>
                </div>
              ) : !allHistory || !Array.isArray(allHistory) || allHistory.length === 0 ? (
                <div className="text-center py-8">
                  <Calendar className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600">No hay historial de aprobaciones</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {Array.isArray(allHistory) && allHistory.map((approval: PendingApproval) => (
                    <Card key={approval.id} className="border-l-4 border-l-blue-500">
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between">
                          <div>
                            <CardTitle className="text-lg">{getActionTypeLabel(approval.action_type)}</CardTitle>
                            <CardDescription>{approval.action_description || approval.reason}</CardDescription>
                          </div>
                          <div className="text-right">
                            {getStatusBadge(approval.status)}
                            <p className="text-sm text-gray-500 mt-1">{formatDate(approval.created_at)}</p>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {/* Información del solicitante */}
                        <div className="flex items-center space-x-2 text-sm text-gray-600">
                          <User className="w-4 h-4" />
                          <span>Solicitado por: {(approval as any).requester_name || 'Usuario'} ({(approval as any).requester_role || 'Sin rol'})</span>
                        </div>

                        {/* Datos de la solicitud */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
                          <div>
                            <h4 className="font-medium text-gray-900 mb-2">Datos Originales</h4>
                            <div className="text-sm text-gray-700">
                              {approval.original_data ? renderApprovalData(approval.original_data) : 'Sin datos'}
                            </div>
                          </div>
                          <div>
                            <h4 className="font-medium text-gray-900 mb-2">Datos Solicitados</h4>
                            <div className="text-sm text-gray-700">
                              {approval.requested_data ? renderApprovalData(approval.requested_data) : 'Sin datos'}
                            </div>
                          </div>
                        </div>

                        {/* Motivo de la solicitud */}
                        {approval.reason && (
                          <div className="p-3 bg-blue-50 border-l-4 border-blue-200 rounded-r-md">
                            <h4 className="font-medium text-blue-900 mb-1">Motivo de la Solicitud</h4>
                            <p className="text-blue-800 text-sm">{approval.reason}</p>
                          </div>
                        )}

                        {/* Observaciones del administrador */}
                        {approval.approval_notes && (
                          <div className="p-3 bg-green-50 border-l-4 border-green-200 rounded-r-md">
                            <h4 className="font-medium text-green-900 mb-1">Observaciones del Administrador</h4>
                            <p className="text-green-800 text-sm">{approval.approval_notes}</p>
                            {approval.approved_by && (
                              <div className="mt-2 flex items-center space-x-2 text-xs text-green-700">
                                <User className="w-3 h-3" />
                                <span>Procesado por administrador (ID: {approval.approved_by})</span>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Timeline de la solicitud */}
                        <div className="border-t pt-3">
                          <h4 className="font-medium text-gray-900 mb-2">Cronología</h4>
                          <div className="space-y-2 text-sm">
                            <div className="flex items-center space-x-2 text-gray-600">
                              <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                              <span>Solicitud creada: {formatDate(approval.created_at)}</span>
                            </div>
                            {approval.updated_at && approval.updated_at !== approval.created_at && (
                              <div className="flex items-center space-x-2 text-gray-600">
                                <div className={`w-2 h-2 rounded-full ${
                                  approval.status === 'approved' ? 'bg-green-500' : 
                                  approval.status === 'rejected' ? 'bg-red-500' : 'bg-yellow-500'
                                }`}></div>
                                <span>
                                  {approval.status === 'approved' ? 'Aprobada' : 
                                   approval.status === 'rejected' ? 'Rechazada' : 'Actualizada'}: 
                                  {formatDate(approval.updated_at)}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <MessageSquare className="w-5 h-5" />
                <span>Notificaciones</span>
              </CardTitle>
              <CardDescription>
                Notificaciones sobre el estado de las aprobaciones
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingNotifications ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                  <p className="mt-2 text-gray-600">Cargando notificaciones...</p>
                </div>
              ) : !notifications || !Array.isArray(notifications) || notifications.length === 0 ? (
                <div className="text-center py-8">
                  <MessageSquare className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600">No hay notificaciones</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {Array.isArray(notifications) && notifications.map((notification: ApprovalNotification) => (
                    <div
                      key={notification.id}
                      className={`p-4 rounded-lg border ${
                        notification.is_read ? 'bg-gray-50 border-gray-200' : 'bg-blue-50 border-blue-200'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-start space-x-3">
                          {getNotificationTypeIcon(notification.notification_type)}
                          <div>
                            <h4 className="font-medium text-gray-900">{notification.title}</h4>
                            <p className="text-sm text-gray-600 mt-1">{notification.message}</p>
                            <p className="text-xs text-gray-500 mt-2">
                              {formatDate(notification.sent_at)}
                            </p>
                          </div>
                        </div>
                        {!notification.is_read && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => markAsReadMutation.mutate(notification.id)}
                            className="text-blue-600 hover:bg-blue-100"
                          >
                            <Eye className="w-4 h-4 mr-1" />
                            Marcar como leída
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Observations Dialog */}
      <Dialog open={!!selectedApproval && !showDecisionDialog} onOpenChange={() => setSelectedApproval(null)}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2">
              <Eye className="w-5 h-5 text-blue-500" />
              <span>Observaciones de la Solicitud</span>
            </DialogTitle>
            <DialogDescription>
              Revisa los detalles completos de la solicitud antes de tomar una decisión
            </DialogDescription>
          </DialogHeader>
          {selectedApproval && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium text-gray-700">Tipo de Acción</Label>
                  <p className="text-sm bg-gray-50 p-2 rounded">{getActionTypeLabel(selectedApproval.action_type)}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-gray-700">Prioridad</Label>
                  <div className="mt-1">
                    <Badge variant={selectedApproval.priority === 'high' ? 'destructive' : selectedApproval.priority === 'medium' ? 'default' : 'secondary'}>
                      {selectedApproval.priority === 'high' ? 'Alta' : selectedApproval.priority === 'medium' ? 'Media' : 'Baja'}
                    </Badge>
                  </div>
                </div>
              </div>
              
              <div>
                <Label className="text-sm font-medium text-gray-700">Solicitado por</Label>
                <div className="bg-gray-50 p-3 rounded">
                  <p className="font-medium">{selectedApproval.requester_name}</p>
                  <p className="text-sm text-gray-600">{selectedApproval.requester_email}</p>
                  <Badge variant="outline" className="text-xs mt-1">{selectedApproval.requester_role}</Badge>
                </div>
              </div>

              <div>
                <Label className="text-sm font-medium text-gray-700">Justificación</Label>
                <p className="text-sm bg-gray-50 p-3 rounded">{selectedApproval.reason}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium text-gray-700">Datos Actuales</Label>
                  <div className="bg-gray-50 p-3 rounded">
                    {(() => {
                      try {
                        const data = JSON.parse(selectedApproval.original_data);
                        return (
                          <div className="space-y-1">
                            {Object.entries(data).map(([key, value]) => (
                              <div key={key} className="flex justify-between">
                                <span className="font-medium text-gray-700">{getTranslatedFieldName(key)}:</span>
                                <span className="text-gray-900">{String(value)}</span>
                              </div>
                            ))}
                          </div>
                        );
                      } catch {
                        return <span className="text-gray-500">No hay datos disponibles</span>;
                      }
                    })()}
                  </div>
                </div>
                <div>
                  <Label className="text-sm font-medium text-gray-700">Datos Solicitados</Label>
                  <div className="bg-blue-50 p-3 rounded">
                    {(() => {
                      try {
                        const data = JSON.parse(selectedApproval.requested_data);
                        return (
                          <div className="space-y-1">
                            {Object.entries(data).map(([key, value]) => (
                              <div key={key} className="flex justify-between">
                                <span className="font-medium text-blue-700">{getTranslatedFieldName(key)}:</span>
                                <span className="text-blue-900 font-semibold">{String(value)}</span>
                              </div>
                            ))}
                          </div>
                        );
                      } catch {
                        return <span className="text-blue-500">No hay datos disponibles</span>;
                      }
                    })()}
                  </div>
                </div>
              </div>

              <div>
                <Label className="text-sm font-medium text-gray-700">Fecha de Solicitud</Label>
                <p className="text-sm bg-gray-50 p-2 rounded">{formatDate(selectedApproval.created_at)}</p>
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t">
                <Button
                  variant="outline"
                  onClick={() => setSelectedApproval(null)}
                >
                  Cerrar
                </Button>
                <Button
                  variant="outline"
                  className="text-red-600 border-red-300 hover:bg-red-50"
                  onClick={() => handleDecision(selectedApproval, 'rejected')}
                >
                  <XCircle className="w-4 h-4 mr-1" />
                  Rechazar
                </Button>
                <Button
                  className="bg-green-600 hover:bg-green-700 text-white"
                  onClick={() => handleDecision(selectedApproval, 'approved')}
                >
                  <CheckCircle className="w-4 h-4 mr-1" />
                  Aprobar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Decision Dialog */}
      <Dialog open={showDecisionDialog} onOpenChange={setShowDecisionDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2">
              {currentDecision === 'approved' ? (
                <CheckCircle className="w-5 h-5 text-green-500" />
              ) : (
                <XCircle className="w-5 h-5 text-red-500" />
              )}
              <span>
                {currentDecision === 'approved' ? 'Aprobar' : 'Rechazar'} Solicitud
              </span>
            </DialogTitle>
            <DialogDescription>
              {selectedApproval && (
                <div className="space-y-2">
                  <p><strong>Acción:</strong> {getActionTypeLabel(selectedApproval.action_type)}</p>
                  <p><strong>Descripción:</strong> {selectedApproval.action_description}</p>
                  <p><strong>Motivo:</strong> {selectedApproval.reason}</p>
                </div>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="decision-notes">
                Notas de la decisión {currentDecision === 'rejected' ? '(requeridas)' : '(opcionales)'}
              </Label>
              <Textarea
                id="decision-notes"
                placeholder={
                  currentDecision === 'approved' 
                    ? "Agregar comentarios sobre la aprobación..."
                    : "Explica por qué se rechaza esta solicitud..."
                }
                value={decisionNotes}
                onChange={(e) => setDecisionNotes(e.target.value)}
                className="resize-none"
                rows={3}
              />
            </div>
          </div>
          <div className="flex justify-end space-x-2">
            <Button 
              variant="outline" 
              onClick={() => setShowDecisionDialog(false)}
              disabled={decisionMutation.isPending}
            >
              Cancelar
            </Button>
            <Button 
              onClick={confirmDecision}
              disabled={
                decisionMutation.isPending || 
                (currentDecision === 'rejected' && !decisionNotes.trim())
              }
              className={
                currentDecision === 'approved' 
                  ? "bg-green-600 hover:bg-green-700" 
                  : "bg-red-600 hover:bg-red-700"
              }
            >
              {decisionMutation.isPending ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
              ) : (
                currentDecision === 'approved' ? (
                  <CheckCircle className="w-4 h-4 mr-2" />
                ) : (
                  <XCircle className="w-4 h-4 mr-2" />
                )
              )}
              {currentDecision === 'approved' ? 'Aprobar' : 'Rechazar'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}