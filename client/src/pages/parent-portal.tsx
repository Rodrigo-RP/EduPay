import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import MobileHeader from "@/components/layout/mobile-header";
import PaymentModal from "@/components/payment-modal";
import { useAuth } from "@/hooks/use-auth";

interface Student {
  id: number;
  nombre_completo: string;
  grado: string;
  grupo: string;
  campus: {
    nombre: string;
  };
}

interface PendingCharge {
  id: number;
  concept: {
    nombre: string;
  };
  student: {
    nombre_completo: string;
  };
  fecha_vencimiento: string;
  monto_base_centavos: number;
  beca_aplicada: string;
  recargo_aplicado_centavos: number;
  total_amount_centavos: number;
}

interface PaymentMethod {
  id: number;
  tipo: string;
  last4: string;
}

interface DashboardData {
  students: Student[];
  pendingCharges: PendingCharge[];
  totalPendingBalance: number;
  paymentMethods: PaymentMethod[];
}

export default function ParentPortal() {
  const { guardian } = useAuth();
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedCharge, setSelectedCharge] = useState<PendingCharge | null>(null);

  const { data: dashboardData, isLoading } = useQuery<DashboardData>({
    queryKey: ["/api/guardian/dashboard"],
    enabled: !!guardian,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!dashboardData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <p className="text-slate-600">No se encontraron datos del dashboard</p>
        </div>
      </div>
    );
  }

  const currentStudent = selectedStudent || dashboardData.students[0];
  const studentCharges = dashboardData.pendingCharges.filter(
    charge => charge.student.nombre_completo === currentStudent?.nombre_completo
  );

  const handlePayNow = () => {
    if (studentCharges.length > 0) {
      setSelectedCharge(studentCharges[0]);
      setShowPaymentModal(true);
    }
  };

  const handlePayCharge = (charge: PendingCharge) => {
    setSelectedCharge(charge);
    setShowPaymentModal(true);
  };

  const formatCurrency = (centavos: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN'
    }).format(centavos / 100);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-MX', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  };

  const getChargeStatus = (charge: PendingCharge) => {
    const dueDate = new Date(charge.fecha_vencimiento);
    const today = new Date();
    
    if (dueDate < today) {
      return { label: "Vencido", color: "bg-red-100 text-red-700" };
    } else if (dueDate.getTime() - today.getTime() < 7 * 24 * 60 * 60 * 1000) {
      return { label: "Por vencer", color: "bg-yellow-100 text-yellow-700" };
    } else {
      return { label: "Pendiente", color: "bg-blue-100 text-blue-700" };
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <MobileHeader 
        schoolName={currentStudent?.campus.nombre || "EscuelaPay"}
        studentName={guardian?.nombre_completo || ""}
      />

      {/* Student Selector */}
      {dashboardData.students.length > 1 && (
        <div className="px-4 py-3 bg-white border-b border-slate-100">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
              <span className="text-primary-600 font-semibold text-sm">
                {currentStudent?.nombre_completo.split(' ').map(n => n[0]).join('').substring(0, 2)}
              </span>
            </div>
            <div className="flex-1">
              <p className="font-medium text-slate-900">{currentStudent?.nombre_completo}</p>
              <p className="text-sm text-slate-500">{currentStudent?.grado} - {currentStudent?.grupo}</p>
            </div>
            <Button 
              variant="ghost" 
              size="sm"
              className="text-primary-600 font-medium"
              onClick={() => {
                const nextIndex = (dashboardData.students.indexOf(currentStudent) + 1) % dashboardData.students.length;
                setSelectedStudent(dashboardData.students[nextIndex]);
              }}
            >
              Cambiar
            </Button>
          </div>
        </div>
      )}

      {/* Account Summary Card */}
      <div className="p-4">
        <Card className="shadow-sm border border-slate-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-900">Estado de Cuenta</h2>
              <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-1 rounded-full font-medium">
                {studentCharges.length} pendiente{studentCharges.length !== 1 ? 's' : ''}
              </span>
            </div>
            
            <div className="space-y-3">
              <div className="bg-slate-50 rounded-lg p-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-600">Saldo pendiente</span>
                  <span className="text-xl font-bold text-slate-900">
                    {formatCurrency(studentCharges.reduce((sum, charge) => sum + charge.total_amount_centavos, 0))}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Button 
                  className="bg-primary-600 text-white hover:bg-primary-700 p-3"
                  onClick={handlePayNow}
                  disabled={studentCharges.length === 0}
                >
                  <i className="fas fa-credit-card mb-1 block text-sm"></i>
                  Pagar Ahora
                </Button>
                <Button 
                  variant="secondary"
                  className="bg-slate-100 text-slate-700 hover:bg-slate-200 p-3"
                >
                  <i className="fas fa-history mb-1 block text-sm"></i>
                  Historial
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pending Charges List */}
      <div className="px-4 pb-20">
        <h3 className="text-lg font-semibold text-slate-900 mb-3">Cargos Pendientes</h3>
        
        {studentCharges.length === 0 ? (
          <Card className="shadow-sm border border-slate-200">
            <CardContent className="p-6 text-center">
              <i className="fas fa-check-circle text-green-500 text-3xl mb-2"></i>
              <p className="text-slate-600">No hay cargos pendientes</p>
            </CardContent>
          </Card>
        ) : (
          studentCharges.map((charge) => {
            const status = getChargeStatus(charge);
            const hasDiscount = Number(charge.beca_aplicada) > 0;
            
            return (
              <Card key={charge.id} className="shadow-sm border border-slate-200 mb-3">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <h4 className="font-semibold text-slate-900">{charge.concept.nombre}</h4>
                      <p className="text-sm text-slate-500">
                        Vence: {formatDate(charge.fecha_vencimiento)}
                      </p>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${status.color}`}>
                      {status.label}
                    </span>
                  </div>
                  
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-right">
                      {hasDiscount && (
                        <p className="text-sm text-slate-500 line-through">
                          {formatCurrency(charge.monto_base_centavos)}
                        </p>
                      )}
                      <p className="text-lg font-bold text-slate-900">
                        {formatCurrency(charge.total_amount_centavos)}
                      </p>
                      {hasDiscount && (
                        <p className="text-xs text-green-600">
                          Descuento beca: {charge.beca_aplicada}%
                        </p>
                      )}
                    </div>
                  </div>
                  
                  <Button 
                    className="w-full bg-primary-600 text-white hover:bg-primary-700"
                    onClick={() => handlePayCharge(charge)}
                  >
                    Pagar {formatCurrency(charge.total_amount_centavos)}
                  </Button>
                </CardContent>
              </Card>
            );
          })
        )}

        {/* Payment Methods Section */}
        <Card className="shadow-sm border border-slate-200 mt-4">
          <CardContent className="p-4">
            <h4 className="font-semibold text-slate-900 mb-3">Métodos de Pago</h4>
            
            <div className="space-y-2">
              {dashboardData.paymentMethods.map((method) => (
                <div key={method.id} className="flex items-center p-3 border border-slate-200 rounded-lg">
                  <i className="fas fa-credit-card text-slate-400 mr-3"></i>
                  <div className="flex-1">
                    <p className="font-medium text-slate-900">•••• •••• •••• {method.last4}</p>
                    <p className="text-sm text-slate-500">
                      {method.tipo.charAt(0).toUpperCase() + method.tipo.slice(1)} terminada en {method.last4}
                    </p>
                  </div>
                  <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">
                    Principal
                  </span>
                </div>
              ))}
              
              <Button 
                variant="outline"
                className="w-full p-3 border-2 border-dashed border-slate-300 hover:border-primary-300 hover:text-primary-600"
              >
                <i className="fas fa-plus mr-2"></i>
                Agregar método de pago
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200">
        <div className="grid grid-cols-4 py-2">
          <button className="flex flex-col items-center py-2 text-primary-600">
            <i className="fas fa-home text-lg mb-1"></i>
            <span className="text-xs font-medium">Inicio</span>
          </button>
          <button className="flex flex-col items-center py-2 text-slate-400">
            <i className="fas fa-credit-card text-lg mb-1"></i>
            <span className="text-xs">Pagos</span>
          </button>
          <button className="flex flex-col items-center py-2 text-slate-400">
            <i className="fas fa-file-invoice text-lg mb-1"></i>
            <span className="text-xs">Facturas</span>
          </button>
          <button className="flex flex-col items-center py-2 text-slate-400">
            <i className="fas fa-user text-lg mb-1"></i>
            <span className="text-xs">Perfil</span>
          </button>
        </div>
      </nav>

      {/* Payment Modal */}
      {showPaymentModal && selectedCharge && (
        <PaymentModal
          charge={selectedCharge}
          paymentMethods={dashboardData.paymentMethods}
          onClose={() => setShowPaymentModal(false)}
          onSuccess={() => {
            setShowPaymentModal(false);
            // Refresh data
            window.location.reload();
          }}
        />
      )}
    </div>
  );
}
