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
  action_description: string;
  current_value?: string;
  proposed_value?: string;
  reason: string;
  additional_data?: string;
  status: string;
  created_at: string;
  updated_at: string;
  approved_by?: number;
  approval_notes?: string;
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

  // Decision mutation
  const decisionMutation = useMutation({
    mutationFn: async (data: { approval_id: number; decision: string; notes?: string }) => {
      const response = await apiRequest('POST', '/api/approvals/decision', data);
      return response.json();
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
      return await apiRequest('POST', `/api/approvals/notifications/${id}/read`);
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
        <TabsList className="grid w-full grid-cols-3">
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
                      <TableHead>Descripción</TableHead>
                      <TableHead>Valor Actual</TableHead>
                      <TableHead>Valor Propuesto</TableHead>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Array.isArray(pendingApprovals) && pendingApprovals.map((approval: PendingApproval) => (
                      <TableRow key={approval.id}>
                        <TableCell className="font-medium">
                          {getActionTypeLabel(approval.action_type)}
                        </TableCell>
                        <TableCell>{approval.action_description}</TableCell>
                        <TableCell className="text-gray-600">
                          {approval.current_value || '-'}
                        </TableCell>
                        <TableCell className="font-medium text-blue-600">
                          {approval.proposed_value || '-'}
                        </TableCell>
                        <TableCell>{formatDate(approval.created_at)}</TableCell>
                        <TableCell>{getStatusBadge(approval.status)}</TableCell>
                        <TableCell>
                          {approval.status === 'pending' && (
                            <div className="flex space-x-2">
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
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
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