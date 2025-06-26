import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { 
  MessageCircle, Phone, Mail, Clock, CheckCircle, AlertTriangle, 
  Users, School, Settings, FileText, Headphones, Search,
  TrendingUp, Activity, Zap, Shield, Database, Bug
} from "lucide-react";

interface SupportTicket {
  id: number;
  school_name: string;
  contact_name: string;
  email: string;
  phone: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  category: 'technical' | 'billing' | 'training' | 'integration';
  status: 'open' | 'in_progress' | 'pending_customer' | 'resolved' | 'closed';
  subject: string;
  description: string;
  created_at: string;
  last_update: string;
  assigned_to: string;
  resolution_time?: number;
}

interface SupportMetrics {
  total_tickets: number;
  open_tickets: number;
  avg_response_time: number;
  satisfaction_score: number;
  resolved_today: number;
  escalated_tickets: number;
}

export default function SupportDashboard() {
  const { toast } = useToast();
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [ticketFilter, setTicketFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [newResponse, setNewResponse] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  // Fetch support metrics
  const { data: metrics, isLoading: metricsLoading } = useQuery({
    queryKey: ["/api/support/metrics"],
    queryFn: async () => {
      // Simulated data for support metrics
      return {
        total_tickets: 156,
        open_tickets: 23,
        avg_response_time: 45, // minutes
        satisfaction_score: 4.7,
        resolved_today: 12,
        escalated_tickets: 3
      } as SupportMetrics;
    },
  });

  // Fetch support tickets
  const { data: tickets = [], isLoading: ticketsLoading } = useQuery({
    queryKey: ["/api/support/tickets"],
    queryFn: async () => {
      // Simulated support tickets data
      return [
        {
          id: 1,
          school_name: "Colegio San Patricio",
          contact_name: "María González",
          email: "maria.gonzalez@sanpatricio.edu.mx",
          phone: "+52 55 1234-5678",
          priority: "high",
          category: "technical",
          status: "open",
          subject: "Error en generación de facturas CFDI",
          description: "No se pueden generar las facturas del mes de enero. Aparece error 500.",
          created_at: "2025-01-26 09:30:00",
          last_update: "2025-01-26 10:15:00",
          assigned_to: "Ana Soporte",
          resolution_time: undefined
        },
        {
          id: 2,
          school_name: "Instituto Montessori",
          contact_name: "Carlos Ramírez",
          email: "carlos.ramirez@montessori.edu.mx",
          phone: "+52 55 9876-5432",
          priority: "medium",
          category: "training",
          status: "in_progress",
          subject: "Capacitación para nuevo personal",
          description: "Necesitamos capacitar a 3 nuevos empleados en el uso de la plataforma.",
          created_at: "2025-01-25 14:20:00",
          last_update: "2025-01-26 08:45:00",
          assigned_to: "Luis Capacitación",
          resolution_time: undefined
        },
        {
          id: 3,
          school_name: "Escuela Primaria Azteca",
          contact_name: "Patricia López",
          email: "patricia.lopez@azteca.edu.mx",
          phone: "+52 55 5555-1234",
          priority: "critical",
          category: "billing",
          status: "open",
          subject: "Pagos no se reflejan en el sistema",
          description: "Los pagos realizados ayer no aparecen en el sistema. Padres reportan cargos duplicados.",
          created_at: "2025-01-26 11:00:00",
          last_update: "2025-01-26 11:00:00",
          assigned_to: "Pendiente",
          resolution_time: undefined
        },
        {
          id: 4,
          school_name: "Colegio Tecnológico",
          contact_name: "Roberto Silva",
          email: "roberto.silva@tecnologico.edu.mx",
          phone: "+52 55 7777-8888",
          priority: "low",
          category: "integration",
          status: "resolved",
          subject: "Integración con sistema contable",
          description: "Solicitud de integración con SAP para exportar reportes automáticamente.",
          created_at: "2025-01-24 16:30:00",
          last_update: "2025-01-26 09:00:00",
          assigned_to: "Miguel Integraciones",
          resolution_time: 1260 // 21 hours
        }
      ] as SupportTicket[];
    },
  });

  // Update ticket status mutation
  const updateTicketMutation = useMutation({
    mutationFn: async ({ ticketId, status }: { ticketId: number; status: string }) => {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 500));
      return { success: true };
    },
    onSuccess: () => {
      toast({
        title: "Estado Actualizado",
        description: "El estado del ticket ha sido actualizado exitosamente",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/support/tickets"] });
    },
  });

  // Add response mutation
  const addResponseMutation = useMutation({
    mutationFn: async ({ ticketId, response }: { ticketId: number; response: string }) => {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 500));
      return { success: true };
    },
    onSuccess: () => {
      toast({
        title: "Respuesta Enviada",
        description: "Tu respuesta ha sido enviada al cliente",
      });
      setNewResponse("");
      queryClient.invalidateQueries({ queryKey: ["/api/support/tickets"] });
    },
  });

  // Filter tickets
  const filteredTickets = tickets.filter(ticket => {
    const matchesStatus = ticketFilter === "all" || ticket.status === ticketFilter;
    const matchesPriority = priorityFilter === "all" || ticket.priority === priorityFilter;
    const matchesSearch = searchTerm === "" || 
      ticket.school_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ticket.subject.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ticket.contact_name.toLowerCase().includes(searchTerm.toLowerCase());
    
    return matchesStatus && matchesPriority && matchesSearch;
  });

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical': return 'bg-red-100 text-red-800';
      case 'high': return 'bg-orange-100 text-orange-800';
      case 'medium': return 'bg-yellow-100 text-yellow-800';
      case 'low': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open': return 'bg-red-100 text-red-800';
      case 'in_progress': return 'bg-blue-100 text-blue-800';
      case 'pending_customer': return 'bg-yellow-100 text-yellow-800';
      case 'resolved': return 'bg-green-100 text-green-800';
      case 'closed': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
                <Headphones className="h-8 w-8 text-blue-600" />
                Dashboard de Soporte Técnico
              </h1>
              <p className="text-gray-600 mt-2">
                Centro de atención al cliente y resolución de incidencias
              </p>
            </div>
            <div className="flex items-center gap-4">
              <Badge className="bg-green-100 text-green-800 font-semibold">
                Tier 2 Support
              </Badge>
              <Button className="bg-blue-600 hover:bg-blue-700">
                <MessageCircle className="h-4 w-4 mr-2" />
                Nuevo Ticket
              </Button>
            </div>
          </div>
        </div>

        {/* Metrics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Tickets</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics?.total_tickets || 0}</div>
              <p className="text-xs text-muted-foreground">Este mes</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Tickets Abiertos</CardTitle>
              <AlertTriangle className="h-4 w-4 text-orange-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">{metrics?.open_tickets || 0}</div>
              <p className="text-xs text-muted-foreground">Requieren atención</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Tiempo Respuesta</CardTitle>
              <Clock className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{metrics?.avg_response_time || 0}m</div>
              <p className="text-xs text-muted-foreground">Promedio</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Satisfacción</CardTitle>
              <TrendingUp className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{metrics?.satisfaction_score || 0}/5</div>
              <p className="text-xs text-muted-foreground">Rating promedio</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Resueltos Hoy</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{metrics?.resolved_today || 0}</div>
              <p className="text-xs text-muted-foreground">Tickets cerrados</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Escalados</CardTitle>
              <Activity className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{metrics?.escalated_tickets || 0}</div>
              <p className="text-xs text-muted-foreground">Nivel superior</p>
            </CardContent>
          </Card>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Tickets List */}
          <div className="lg:col-span-2 space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Tickets de Soporte</CardTitle>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search className="h-4 w-4 absolute left-3 top-3 text-gray-400" />
                      <Input
                        placeholder="Buscar tickets..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10 w-64"
                      />
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Select value={ticketFilter} onValueChange={setTicketFilter}>
                    <SelectTrigger className="w-40">
                      <SelectValue placeholder="Estado" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos los estados</SelectItem>
                      <SelectItem value="open">Abiertos</SelectItem>
                      <SelectItem value="in_progress">En progreso</SelectItem>
                      <SelectItem value="pending_customer">Pendiente cliente</SelectItem>
                      <SelectItem value="resolved">Resueltos</SelectItem>
                      <SelectItem value="closed">Cerrados</SelectItem>
                    </SelectContent>
                  </Select>
                  
                  <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                    <SelectTrigger className="w-40">
                      <SelectValue placeholder="Prioridad" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas las prioridades</SelectItem>
                      <SelectItem value="critical">Crítica</SelectItem>
                      <SelectItem value="high">Alta</SelectItem>
                      <SelectItem value="medium">Media</SelectItem>
                      <SelectItem value="low">Baja</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {filteredTickets.map((ticket) => (
                    <div
                      key={ticket.id}
                      className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                        selectedTicket?.id === ticket.id
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:bg-gray-50'
                      }`}
                      onClick={() => setSelectedTicket(ticket)}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge className={getPriorityColor(ticket.priority)}>
                              {ticket.priority.toUpperCase()}
                            </Badge>
                            <Badge className={getStatusColor(ticket.status)}>
                              {ticket.status.replace('_', ' ').toUpperCase()}
                            </Badge>
                            <span className="text-sm text-gray-500">#{ticket.id}</span>
                          </div>
                          <h4 className="font-semibold text-gray-900 mb-1">{ticket.subject}</h4>
                          <p className="text-sm text-gray-600 mb-2">{ticket.school_name}</p>
                          <p className="text-sm text-gray-500">
                            {ticket.contact_name} • {ticket.created_at}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-medium text-gray-900">{ticket.assigned_to}</p>
                          <p className="text-xs text-gray-500">Asignado</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Ticket Details */}
          <div className="space-y-4">
            {selectedTicket ? (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Ticket #{selectedTicket.id}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <h4 className="font-semibold mb-2">{selectedTicket.subject}</h4>
                    <p className="text-sm text-gray-600 mb-4">{selectedTicket.description}</p>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm font-medium">Escuela:</span>
                      <span className="text-sm">{selectedTicket.school_name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm font-medium">Contacto:</span>
                      <span className="text-sm">{selectedTicket.contact_name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm font-medium">Email:</span>
                      <span className="text-sm">{selectedTicket.email}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm font-medium">Teléfono:</span>
                      <span className="text-sm">{selectedTicket.phone}</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Cambiar Estado</Label>
                    <Select
                      value={selectedTicket.status}
                      onValueChange={(status) => 
                        updateTicketMutation.mutate({ ticketId: selectedTicket.id, status })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="open">Abierto</SelectItem>
                        <SelectItem value="in_progress">En progreso</SelectItem>
                        <SelectItem value="pending_customer">Pendiente cliente</SelectItem>
                        <SelectItem value="resolved">Resuelto</SelectItem>
                        <SelectItem value="closed">Cerrado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Agregar Respuesta</Label>
                    <Textarea
                      placeholder="Escribe tu respuesta..."
                      value={newResponse}
                      onChange={(e) => setNewResponse(e.target.value)}
                      className="min-h-24"
                    />
                    <Button 
                      className="w-full"
                      onClick={() => addResponseMutation.mutate({
                        ticketId: selectedTicket.id,
                        response: newResponse
                      })}
                      disabled={!newResponse.trim()}
                    >
                      Enviar Respuesta
                    </Button>
                  </div>

                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1">
                      <Phone className="h-4 w-4 mr-2" />
                      Llamar
                    </Button>
                    <Button variant="outline" size="sm" className="flex-1">
                      <Mail className="h-4 w-4 mr-2" />
                      Email
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="text-center py-12">
                  <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500">Selecciona un ticket para ver los detalles</p>
                </CardContent>
              </Card>
            )}

            {/* Quick Actions */}
            <Card>
              <CardHeader>
                <CardTitle>Acciones Rápidas</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button variant="outline" className="w-full justify-start">
                  <Bug className="h-4 w-4 mr-2" />
                  Reportar Bug
                </Button>
                <Button variant="outline" className="w-full justify-start">
                  <Shield className="h-4 w-4 mr-2" />
                  Escalación Seguridad
                </Button>
                <Button variant="outline" className="w-full justify-start">
                  <Database className="h-4 w-4 mr-2" />
                  Revisar Base Datos
                </Button>
                <Button variant="outline" className="w-full justify-start">
                  <Settings className="h-4 w-4 mr-2" />
                  Herramientas Admin
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}