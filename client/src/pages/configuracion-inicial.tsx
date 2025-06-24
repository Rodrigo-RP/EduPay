// Módulo 1: Configuración inicial - Onboarding guiado (< 1 hora)
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { CheckCircle, Circle, School, CreditCard, FileText, Calendar, Gift } from "lucide-react";

interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  icon: any;
}

export default function ConfiguracionInicial() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [currentStep, setCurrentStep] = useState(0);

  const steps: OnboardingStep[] = [
    {
      id: "escuela",
      title: "Registro de la escuela",
      description: "Nombre, RFC, timbrado SAT",
      completed: false,
      icon: School
    },
    {
      id: "alumnos",
      title: "Importación de alumnos",
      description: "Alumnos y responsables de pago",
      completed: false,
      icon: FileText
    },
    {
      id: "conceptos",
      title: "Conceptos de pago",
      description: "Colegiatura mensual, inscripción, cuotas especiales",
      completed: false,
      icon: CreditCard
    },
    {
      id: "calendario",
      title: "Calendario de vencimientos",
      description: "Fechas de pago y cortes",
      completed: false,
      icon: Calendar
    },
    {
      id: "becas",
      title: "Becas y descuentos",
      description: "Configuración de apoyos económicos",
      completed: false,
      icon: Gift
    }
  ];

  // Step 1: Registro de escuela
  const EscuelaForm = () => {
    const [formData, setFormData] = useState({
      nombre_legal: "",
      rfc: "",
      timbrado_sat: "",
      pac_proveedor: "FACTURAMA",
      pasarela_pagos: "STRIPE"
    });

    const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      try {
        await apiRequest("POST", "/api/admin/configuracion/escuela", formData);
        toast({
          title: "Configuración guardada",
          description: "Datos de la escuela registrados correctamente"
        });
        setCurrentStep(1);
      } catch (error) {
        toast({
          title: "Error",
          description: "No se pudo guardar la configuración",
          variant: "destructive"
        });
      }
    };

    return (
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label htmlFor="nombre_legal">Nombre legal de la escuela</Label>
          <Input
            id="nombre_legal"
            value={formData.nombre_legal}
            onChange={(e) => setFormData({...formData, nombre_legal: e.target.value})}
            placeholder="Colegio San Patricio A.C."
            required
          />
        </div>
        <div>
          <Label htmlFor="rfc">RFC de la institución</Label>
          <Input
            id="rfc"
            value={formData.rfc}
            onChange={(e) => setFormData({...formData, rfc: e.target.value})}
            placeholder="CSP123456789"
            maxLength={13}
            required
          />
        </div>
        <div>
          <Label htmlFor="timbrado_sat">Certificado de timbrado SAT</Label>
          <Input
            id="timbrado_sat"
            value={formData.timbrado_sat}
            onChange={(e) => setFormData({...formData, timbrado_sat: e.target.value})}
            placeholder="Número de certificado SAT"
          />
        </div>
        <div>
          <Label htmlFor="pac_proveedor">Proveedor PAC para CFDI</Label>
          <Select value={formData.pac_proveedor} onValueChange={(value) => setFormData({...formData, pac_proveedor: value})}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="FACTURAMA">Facturama</SelectItem>
              <SelectItem value="ENLACE_FISCAL">Enlace Fiscal</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="pasarela_pagos">Pasarela de pagos</Label>
          <Select value={formData.pasarela_pagos} onValueChange={(value) => setFormData({...formData, pasarela_pagos: value})}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="STRIPE">Stripe</SelectItem>
              <SelectItem value="OPENPAY">Openpay</SelectItem>
              <SelectItem value="CONEKTA">Conekta</SelectItem>
              <SelectItem value="EVO_PAYMENT">Evo Payment</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button type="submit" className="w-full">
          Guardar y continuar
        </Button>
      </form>
    );
  };

  // Step 2: Importación de alumnos
  const AlumnosForm = () => {
    const [importMethod, setImportMethod] = useState<"manual" | "csv">("manual");

    return (
      <div className="space-y-4">
        <div className="flex gap-4">
          <Button
            type="button"
            variant={importMethod === "manual" ? "default" : "outline"}
            onClick={() => setImportMethod("manual")}
          >
            Registro manual
          </Button>
          <Button
            type="button"
            variant={importMethod === "csv" ? "default" : "outline"}
            onClick={() => setImportMethod("csv")}
          >
            Importación masiva CSV/Excel
          </Button>
        </div>

        {importMethod === "csv" ? (
          <div className="space-y-4">
            <div>
              <Label>Archivo de alumnos</Label>
              <Input type="file" accept=".csv,.xlsx" />
              <p className="text-sm text-gray-600 mt-1">
                Formato: Nombre, CURP, Grado, Grupo, Email_responsable, Nombre_responsable, Teléfono
              </p>
            </div>
            <Button className="w-full">
              Procesar archivo
            </Button>
          </div>
        ) : (
          <div className="text-center py-8">
            <p className="text-gray-600 mb-4">
              Para el onboarding rápido, recomendamos usar la importación masiva CSV.
            </p>
            <Button onClick={() => setCurrentStep(2)}>
              Continuar sin alumnos (configurar después)
            </Button>
          </div>
        )}
      </div>
    );
  };

  // Step 3: Conceptos de pago
  const ConceptosForm = () => {
    const [conceptos, setConceptos] = useState([
      { nombre: "Colegiatura Mensual", tipo: "COLEGIATURA_MENSUAL", monto: "5000", periodicidad: "MENSUAL" },
      { nombre: "Inscripción Anual", tipo: "INSCRIPCION_ANUAL", monto: "3000", periodicidad: "ANUAL" },
      { nombre: "Materiales Didácticos", tipo: "CUOTA_ESPECIAL", monto: "1500", periodicidad: "ANUAL" }
    ]);

    return (
      <div className="space-y-4">
        <h3 className="font-semibold">Conceptos de pago principales</h3>
        {conceptos.map((concepto, index) => (
          <Card key={index}>
            <CardContent className="p-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Nombre del concepto</Label>
                  <Input value={concepto.nombre} readOnly />
                </div>
                <div>
                  <Label>Monto (MXN)</Label>
                  <Input 
                    type="number" 
                    value={concepto.monto}
                    onChange={(e) => {
                      const newConceptos = [...conceptos];
                      newConceptos[index].monto = e.target.value;
                      setConceptos(newConceptos);
                    }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        <Button onClick={() => setCurrentStep(3)} className="w-full">
          Configurar conceptos y continuar
        </Button>
      </div>
    );
  };

  // Step 4: Calendario de vencimientos
  const CalendarioForm = () => {
    const [configuracion, setConfiguracion] = useState({
      dia_corte: "5",
      dia_vencimiento: "15",
      descuento_pronto_pago: "5",
      dias_pronto_pago: "5",
      recargo_mora: "10"
    });

    return (
      <div className="space-y-4">
        <h3 className="font-semibold">Configuración de calendario de pagos</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Día de corte mensual</Label>
            <Input 
              type="number" 
              value={configuracion.dia_corte}
              onChange={(e) => setConfiguracion({...configuracion, dia_corte: e.target.value})}
              min="1" max="28"
            />
          </div>
          <div>
            <Label>Día de vencimiento</Label>
            <Input 
              type="number" 
              value={configuracion.dia_vencimiento}
              onChange={(e) => setConfiguracion({...configuracion, dia_vencimiento: e.target.value})}
              min="1" max="28"
            />
          </div>
          <div>
            <Label>Descuento por pronto pago (%)</Label>
            <Input 
              type="number" 
              value={configuracion.descuento_pronto_pago}
              onChange={(e) => setConfiguracion({...configuracion, descuento_pronto_pago: e.target.value})}
              min="0" max="50"
            />
          </div>
          <div>
            <Label>Días para pronto pago</Label>
            <Input 
              type="number" 
              value={configuracion.dias_pronto_pago}
              onChange={(e) => setConfiguracion({...configuracion, dias_pronto_pago: e.target.value})}
              min="1" max="15"
            />
          </div>
        </div>
        <Button onClick={() => setCurrentStep(4)} className="w-full">
          Guardar calendario y continuar
        </Button>
      </div>
    );
  };

  // Step 5: Becas y descuentos
  const BecasForm = () => {
    const [becas, setBecas] = useState([
      { nombre: "Beca de Excelencia Académica", porcentaje: "50", activa: true },
      { nombre: "Beca Socioeconómica", porcentaje: "30", activa: true },
      { nombre: "Descuento Hermanos", porcentaje: "15", activa: true }
    ]);

    const completarOnboarding = async () => {
      try {
        await apiRequest("POST", "/api/admin/configuracion/completar-onboarding", {});
        toast({
          title: "¡Configuración completada!",
          description: "Su escuela está lista para generar cargos y recibir pagos"
        });
        // Redirect to dashboard
      } catch (error) {
        toast({
          title: "Error",
          description: "No se pudo completar la configuración",
          variant: "destructive"
        });
      }
    };

    return (
      <div className="space-y-4">
        <h3 className="font-semibold">Configuración de becas y descuentos</h3>
        {becas.map((beca, index) => (
          <Card key={index}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <Input value={beca.nombre} readOnly className="mb-2" />
                  <div className="flex items-center gap-2">
                    <Label>Porcentaje:</Label>
                    <Input 
                      type="number" 
                      value={beca.porcentaje}
                      className="w-20"
                      min="0" max="100"
                    />
                    <span>%</span>
                  </div>
                </div>
                <Switch checked={beca.activa} />
              </div>
            </CardContent>
          </Card>
        ))}
        <div className="bg-green-50 border border-green-200 rounded p-4 text-center">
          <CheckCircle className="w-8 h-8 text-green-600 mx-auto mb-2" />
          <h3 className="font-semibold text-green-800">¡Listo para comenzar!</h3>
          <p className="text-green-700 text-sm mb-4">
            Su plataforma de pagos está configurada. Meta: 80% pagos antes del vencimiento.
          </p>
          <Button onClick={completarOnboarding} className="bg-green-600 hover:bg-green-700">
            Completar configuración inicial
          </Button>
        </div>
      </div>
    );
  };

  const renderCurrentStep = () => {
    switch (currentStep) {
      case 0: return <EscuelaForm />;
      case 1: return <AlumnosForm />;
      case 2: return <ConceptosForm />;
      case 3: return <CalendarioForm />;
      case 4: return <BecasForm />;
      default: return <EscuelaForm />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">
            Configuración inicial - EscuelaPay
          </h1>
          <p className="text-slate-600">
            Configure su plataforma de pagos en menos de 1 hora
          </p>
        </div>

        {/* Progress Steps */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            {steps.map((step, index) => {
              const Icon = step.icon;
              const isActive = index === currentStep;
              const isCompleted = index < currentStep;
              
              return (
                <div key={step.id} className="flex flex-col items-center">
                  <div className={`w-12 h-12 rounded-full border-2 flex items-center justify-center mb-2 ${
                    isCompleted ? 'bg-green-500 border-green-500 text-white' :
                    isActive ? 'bg-blue-500 border-blue-500 text-white' :
                    'bg-white border-gray-300 text-gray-400'
                  }`}>
                    {isCompleted ? <CheckCircle className="w-6 h-6" /> : <Icon className="w-6 h-6" />}
                  </div>
                  <span className={`text-sm text-center ${isActive ? 'font-semibold' : ''}`}>
                    {step.title}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Current Step Content */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {steps[currentStep] && (
                <>
                  {steps[currentStep].icon && <steps[currentStep].icon className="w-5 h-5" />}
                  {steps[currentStep].title}
                </>
              )}
            </CardTitle>
            <p className="text-slate-600">{steps[currentStep]?.description}</p>
          </CardHeader>
          <CardContent>
            {renderCurrentStep()}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}