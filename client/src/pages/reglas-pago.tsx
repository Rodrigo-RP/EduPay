import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  Plus, 
  Settings, 
  Calendar,
  DollarSign,
  Clock,
  AlertTriangle,
  CheckCircle,
  Edit,
  Trash2,
  PlayCircle,
  FileText
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface PaymentRule {
  id: number;
  campus_id: number;
  name: string;
  description: string;
  rule_type: 'percentage' | 'fixed_amount' | 'progressive' | 'compound';
  is_active: boolean;
  grace_period_days: number;
  grace_period_unit: 'days' | 'weeks';
  late_fee_percentage?: number;
  late_fee_fixed_amount_centavos?: number;
  progressive_rules?: Array<{
    days_from: number;
    days_to: number;
    fee_percentage?: number;
    fee_fixed_amount_centavos?: number;
  }>;
  max_late_fee_centavos?: number;
  min_late_fee_centavos?: number;
  compound_daily: boolean;
  applies_to_weekends: boolean;
  applies_to_holidays: boolean;
  applies_to_concepts: string[];
  created_at: string;
  updated_at: string;
}

interface PaymentRuleFormData {
  name: string;
  description: string;
  rule_type: string;
  grace_period_days: string;
  grace_period_unit: string;
  late_fee_percentage: string;
  late_fee_fixed_amount_centavos: string;
  max_late_fee_centavos: string;
  min_late_fee_centavos: string;
  compound_daily: boolean;
  applies_to_weekends: boolean;
  applies_to_holidays: boolean;
  applies_to_concepts: string[];
}

export default function ReglasPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isTestModalOpen, setIsTestModalOpen] = useState(false);
  const [selectedRule, setSelectedRule] = useState<PaymentRule | null>(null);
  const [testScenarios, setTestScenarios] = useState<any[]>([]);

  const [formData, setFormData] = useState<PaymentRuleFormData>({
    name: '',
    description: '',
    rule_type: 'percentage',
    grace_period_days: '5',
    grace_period_unit: 'days',
    late_fee_percentage: '3',
    late_fee_fixed_amount_centavos: '20000',
    max_late_fee_centavos: '',
    min_late_fee_centavos: '',
    compound_daily: false,
    applies_to_weekends: false,
    applies_to_holidays: false,
    applies_to_concepts: []
  });

  // Fetch payment rules
  const { data: paymentRules, isLoading } = useQuery<PaymentRule[]>({
    queryKey: ['/api/payment-rules'],
  });

  // Fetch concepts for selection
  const { data: concepts } = useQuery<Array<{id: number, nombre: string}>>({
    queryKey: ['/api/concepts'],
  });

  // Create payment rule mutation
  const createRuleMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await fetch('/api/payment-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error('Failed to create rule');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/payment-rules'] });
      setIsCreateModalOpen(false);
      resetForm();
      toast({
        title: "Regla Creada",
        description: "La regla de pago se creó exitosamente",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudo crear la regla de pago",
        variant: "destructive"
      });
    }
  });

  // Test rule mutation
  const testRuleMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await fetch('/api/payment-rules/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error('Failed to test rule');
      return response.json();
    },
    onSuccess: (result: any) => {
      setTestScenarios(result.scenarios);
      setIsTestModalOpen(true);
    }
  });

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      rule_type: 'percentage',
      grace_period_days: '5',
      grace_period_unit: 'days',
      late_fee_percentage: '3',
      late_fee_fixed_amount_centavos: '20000',
      max_late_fee_centavos: '',
      min_late_fee_centavos: '',
      compound_daily: false,
      applies_to_weekends: false,
      applies_to_holidays: false,
      applies_to_concepts: []
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const ruleData = {
      campus_id: user?.campus_id,
      name: formData.name,
      description: formData.description,
      rule_type: formData.rule_type,
      grace_period_days: parseInt(formData.grace_period_days),
      grace_period_unit: formData.grace_period_unit,
      late_fee_percentage: formData.late_fee_percentage ? parseFloat(formData.late_fee_percentage) : null,
      late_fee_fixed_amount_centavos: formData.late_fee_fixed_amount_centavos ? parseInt(formData.late_fee_fixed_amount_centavos) : null,
      max_late_fee_centavos: formData.max_late_fee_centavos ? parseInt(formData.max_late_fee_centavos) : null,
      min_late_fee_centavos: formData.min_late_fee_centavos ? parseInt(formData.min_late_fee_centavos) : null,
      compound_daily: formData.compound_daily,
      applies_to_weekends: formData.applies_to_weekends,
      applies_to_holidays: formData.applies_to_holidays,
      applies_to_concepts: JSON.stringify(formData.applies_to_concepts),
      is_active: true
    };

    createRuleMutation.mutate(ruleData);
  };

  const testRule = (rule: PaymentRule) => {
    setSelectedRule(rule);
    testRuleMutation.mutate({
      rule,
      sampleAmounts: [50000, 100000, 200000, 500000] // $500, $1000, $2000, $5000
    });
  };

  const getRuleTypeDisplay = (type: string) => {
    switch (type) {
      case 'percentage': return 'Porcentaje';
      case 'fixed_amount': return 'Cantidad Fija';
      case 'progressive': return 'Progresivo';
      case 'compound': return 'Compuesto';
      default: return type;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Clock className="h-8 w-8 animate-spin mx-auto mb-2" />
          <p>Cargando reglas de pago...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Reglas de Pago</h1>
          <p className="text-muted-foreground">
            Configura recargos automáticos por pagos extemporáneos
          </p>
        </div>
        <Button onClick={() => setIsCreateModalOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Nueva Regla
        </Button>
      </div>

      {/* SEP Calendar Integration Alert */}
      <Alert>
        <Calendar className="h-4 w-4" />
        <AlertDescription>
          <strong>Integración Calendario SEP 2025-2026:</strong> Las fechas de vencimiento se ajustan automáticamente 
          a días hábiles. Si un pago vence en día no laborable, se mueve al siguiente día hábil sin generar recargo.
        </AlertDescription>
      </Alert>

      {/* Payment Rules Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {paymentRules?.map((rule) => (
          <Card key={rule.id} className="relative">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">{rule.name}</CardTitle>
                <div className="flex items-center gap-2">
                  <Badge variant={rule.is_active ? "default" : "secondary"}>
                    {rule.is_active ? "Activa" : "Inactiva"}
                  </Badge>
                  <Badge variant="outline">
                    {getRuleTypeDisplay(rule.rule_type)}
                  </Badge>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">{rule.description}</p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-medium">Período de Gracia:</span>
                  <div>{rule.grace_period_days} {rule.grace_period_unit === 'weeks' ? 'semanas' : 'días'}</div>
                </div>
                <div>
                  <span className="font-medium">Recargo:</span>
                  <div>
                    {rule.rule_type === 'percentage' && `${rule.late_fee_percentage}%`}
                    {rule.rule_type === 'fixed_amount' && `$${(rule.late_fee_fixed_amount_centavos! / 100).toFixed(2)}`}
                    {rule.rule_type === 'progressive' && 'Variable'}
                    {rule.rule_type === 'compound' && `${rule.late_fee_percentage}% compuesto`}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-1">
                {rule.applies_to_weekends && <Badge variant="outline" className="text-xs">Fines de semana</Badge>}
                {rule.applies_to_holidays && <Badge variant="outline" className="text-xs">Días festivos</Badge>}
                {rule.compound_daily && <Badge variant="outline" className="text-xs">Diario</Badge>}
              </div>

              <div className="flex gap-2 pt-2">
                <Button size="sm" variant="outline" onClick={() => testRule(rule)}>
                  <PlayCircle className="h-3 w-3 mr-1" />
                  Probar
                </Button>
                <Button size="sm" variant="outline">
                  <Edit className="h-3 w-3 mr-1" />
                  Editar
                </Button>
                <Button size="sm" variant="outline" className="text-red-600 hover:text-red-700">
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}

        {/* Empty state */}
        {(!paymentRules || paymentRules.length === 0) && (
          <Card className="col-span-full">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Settings className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No hay reglas configuradas</h3>
              <p className="text-muted-foreground text-center mb-4">
                Configura tu primera regla de pago para automatizar los recargos por morosidad
              </p>
              <Button onClick={() => setIsCreateModalOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Crear Primera Regla
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Create Rule Modal */}
      <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nueva Regla de Pago</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="name">Nombre de la Regla</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ej: Estándar Mexicano"
                  required
                />
              </div>
              <div>
                <Label htmlFor="rule_type">Tipo de Recargo</Label>
                <Select value={formData.rule_type} onValueChange={(value) => setFormData({ ...formData, rule_type: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">Porcentaje</SelectItem>
                    <SelectItem value="fixed_amount">Cantidad Fija</SelectItem>
                    <SelectItem value="progressive">Progresivo</SelectItem>
                    <SelectItem value="compound">Compuesto</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label htmlFor="description">Descripción</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Describe cómo funciona esta regla..."
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="grace_period_days">Período de Gracia</Label>
                <div className="flex gap-2">
                  <Input
                    id="grace_period_days"
                    type="number"
                    value={formData.grace_period_days}
                    onChange={(e) => setFormData({ ...formData, grace_period_days: e.target.value })}
                    min="0"
                    max="30"
                  />
                  <Select value={formData.grace_period_unit} onValueChange={(value) => setFormData({ ...formData, grace_period_unit: value })}>
                    <SelectTrigger className="w-24">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="days">Días</SelectItem>
                      <SelectItem value="weeks">Semanas</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {formData.rule_type === 'percentage' && (
                <div>
                  <Label htmlFor="late_fee_percentage">Porcentaje (%)</Label>
                  <Input
                    id="late_fee_percentage"
                    type="number"
                    step="0.1"
                    value={formData.late_fee_percentage}
                    onChange={(e) => setFormData({ ...formData, late_fee_percentage: e.target.value })}
                    placeholder="3.0"
                  />
                </div>
              )}

              {formData.rule_type === 'fixed_amount' && (
                <div>
                  <Label htmlFor="late_fee_fixed_amount_centavos">Cantidad Fija ($)</Label>
                  <Input
                    id="late_fee_fixed_amount_centavos"
                    type="number"
                    value={formData.late_fee_fixed_amount_centavos ? (parseInt(formData.late_fee_fixed_amount_centavos) / 100).toString() : ''}
                    onChange={(e) => setFormData({ ...formData, late_fee_fixed_amount_centavos: (parseFloat(e.target.value || '0') * 100).toString() })}
                    placeholder="200"
                  />
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="max_late_fee_centavos">Límite Máximo ($)</Label>
                <Input
                  id="max_late_fee_centavos"
                  type="number"
                  value={formData.max_late_fee_centavos ? (parseInt(formData.max_late_fee_centavos) / 100).toString() : ''}
                  onChange={(e) => setFormData({ ...formData, max_late_fee_centavos: e.target.value ? (parseFloat(e.target.value) * 100).toString() : '' })}
                  placeholder="5000"
                />
              </div>
              <div>
                <Label htmlFor="min_late_fee_centavos">Límite Mínimo ($)</Label>
                <Input
                  id="min_late_fee_centavos"
                  type="number"
                  value={formData.min_late_fee_centavos ? (parseInt(formData.min_late_fee_centavos) / 100).toString() : ''}
                  onChange={(e) => setFormData({ ...formData, min_late_fee_centavos: e.target.value ? (parseFloat(e.target.value) * 100).toString() : '' })}
                  placeholder="50"
                />
              </div>
            </div>

            <div className="space-y-3">
              <Label>Configuración Avanzada</Label>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="compound_daily" className="text-sm">Cálculo diario compuesto</Label>
                  <Switch
                    id="compound_daily"
                    checked={formData.compound_daily}
                    onCheckedChange={(checked) => setFormData({ ...formData, compound_daily: checked })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="applies_to_weekends" className="text-sm">Aplicar en fines de semana</Label>
                  <Switch
                    id="applies_to_weekends"
                    checked={formData.applies_to_weekends}
                    onCheckedChange={(checked) => setFormData({ ...formData, applies_to_weekends: checked })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="applies_to_holidays" className="text-sm">Aplicar en días festivos</Label>
                  <Switch
                    id="applies_to_holidays"
                    checked={formData.applies_to_holidays}
                    onCheckedChange={(checked) => setFormData({ ...formData, applies_to_holidays: checked })}
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <Button type="submit" disabled={createRuleMutation.isPending}>
                {createRuleMutation.isPending ? "Creando..." : "Crear Regla"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setIsCreateModalOpen(false)}>
                Cancelar
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Test Results Modal */}
      <Dialog open={isTestModalOpen} onOpenChange={setIsTestModalOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Simulación de Regla: {selectedRule?.name}</DialogTitle>
          </DialogHeader>

          {testScenarios.length > 0 && (
            <div className="space-y-4">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2">Monto Original</th>
                      <th className="text-left p-2">Días de Retraso</th>
                      <th className="text-left p-2">Recargo</th>
                      <th className="text-left p-2">Total a Pagar</th>
                      <th className="text-left p-2">Cálculo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {testScenarios.map((scenario, index) => (
                      <tr key={index} className="border-b">
                        <td className="p-2">${(scenario.originalAmount / 100).toFixed(2)}</td>
                        <td className="p-2">{scenario.daysLate}</td>
                        <td className="p-2 text-red-600">${(scenario.lateFee / 100).toFixed(2)}</td>
                        <td className="p-2 font-medium">${(scenario.totalAmount / 100).toFixed(2)}</td>
                        <td className="p-2 text-xs text-muted-foreground">{scenario.calculation}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="text-xs text-muted-foreground">
                * Los cálculos consideran el ajuste automático de fechas por días no laborales según el calendario SEP
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}