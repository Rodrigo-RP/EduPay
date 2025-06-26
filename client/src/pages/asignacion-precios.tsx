import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { getAcademicLevel, getPriceForStudent, NIVEL_NAMES } from "@/../../shared/academic-levels";
import { Package, Users, DollarSign, CheckCircle, ArrowRight } from "lucide-react";

export default function AsignacionPrecios() {
  const { toast } = useToast();
  const [selectedProduct, setSelectedProduct] = useState("");
  const [showAssignment, setShowAssignment] = useState(false);

  // Productos del catálogo completo con precios diferenciados
  const productos = [
    { 
      id: 1, 
      codigo: "COL-2025", 
      nombre: "Colegiatura Mensual", 
      categoria: "COLEGIATURAS",
      precios_por_nivel: {
        KINDER: 350000,
        PRIMARIA: 450000,
        SECUNDARIA: 550000,
        BACHILLERATO: 650000
      }
    },
    { 
      id: 2, 
      codigo: "INS-2025", 
      nombre: "Inscripción Anual", 
      categoria: "INSCRIPCIONES",
      precios_por_nivel: {
        KINDER: 250000,
        PRIMARIA: 300000,
        SECUNDARIA: 350000,
        BACHILLERATO: 400000
      }
    },
    { 
      id: 3, 
      codigo: "REINS-2025", 
      nombre: "Reinscripción", 
      categoria: "REINSCRIPCIONES",
      precios_por_nivel: {
        KINDER: 150000,
        PRIMARIA: 180000,
        SECUNDARIA: 220000,
        BACHILLERATO: 280000
      }
    },
    { 
      id: 4, 
      codigo: "SEG-ESC-2025", 
      nombre: "Seguro Escolar", 
      categoria: "SEGURO_ESCOLAR",
      precios_por_nivel: {
        KINDER: 60000,
        PRIMARIA: 70000,
        SECUNDARIA: 80000,
        BACHILLERATO: 90000
      }
    },
    { 
      id: 5, 
      codigo: "LIB-2025", 
      nombre: "Paquete de Libros", 
      categoria: "LIBROS",
      precios_por_nivel: {
        KINDER: 80000,
        PRIMARIA: 120000,
        SECUNDARIA: 180000,
        BACHILLERATO: 250000
      }
    },
    { 
      id: 6, 
      codigo: "UNI-2025", 
      nombre: "Uniforme Escolar", 
      categoria: "OTROS",
      precios_por_nivel: {
        KINDER: 95000,
        PRIMARIA: 110000,
        SECUNDARIA: 125000,
        BACHILLERATO: 140000
      }
    }
  ];

  // Estudiantes de ejemplo con diferentes grados
  const estudiantes = [
    { id: 1, nombre: "Ana García López", grado: "K2", grupo: "A" },
    { id: 2, nombre: "Luis Rodríguez Pérez", grado: "3° PRIMARIA", grupo: "B" },
    { id: 3, nombre: "María López González", grado: "1° SECUNDARIA", grupo: "A" },
    { id: 4, nombre: "Carlos Mendoza Silva", grado: "2° BACHILLERATO", grupo: "C" },
    { id: 5, nombre: "Sofia Hernández Cruz", grado: "5° PRIMARIA", grupo: "A" },
    { id: 6, nombre: "Diego Morales Ruiz", grado: "3° SECUNDARIA", grupo: "B" },
    { id: 7, nombre: "Valentina Torres", grado: "K3", grupo: "B" },
    { id: 8, nombre: "Sebastián Vázquez", grado: "1° BACHILLERATO", grupo: "A" }
  ];

  const generateAssignments = () => {
    if (!selectedProduct) return;
    setShowAssignment(true);
  };

  const applyCharges = () => {
    toast({
      title: "Cargos aplicados correctamente",
      description: `Se generaron ${estudiantes.length} cargos con precios automáticos por nivel académico`
    });
  };

  const selectedProductData = productos.find(p => p.id.toString() === selectedProduct);

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">
            Asignación automática de precios por nivel académico
          </h1>
          <p className="text-slate-600">
            Demostración de cómo los productos del catálogo se asignan automáticamente a estudiantes con precios específicos según su nivel académico
          </p>
        </div>

        {/* Selección de producto */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="w-5 h-5" />
              1. Seleccionar producto del catálogo
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Select value={selectedProduct} onValueChange={setSelectedProduct}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar producto del catálogo..." />
                  </SelectTrigger>
                  <SelectContent>
                    {productos.map(producto => (
                      <SelectItem key={producto.id} value={producto.id.toString()}>
                        {producto.codigo} - {producto.nombre} ({producto.categoria.replace('_', ' ')})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <Button 
                onClick={generateAssignments}
                disabled={!selectedProduct}
                className="flex items-center gap-2"
              >
                <ArrowRight className="w-4 h-4" />
                Generar asignaciones automáticas
              </Button>
            </div>

            {/* Mostrar precios del producto seleccionado */}
            {selectedProductData && (
              <div className="mt-4 p-4 bg-blue-50 rounded-lg">
                <h3 className="font-semibold text-blue-900 mb-3">
                  Precios configurados para: {selectedProductData.nombre}
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {Object.entries(selectedProductData.precios_por_nivel).map(([nivel, precio]) => (
                    <div key={nivel} className="text-center p-2 bg-white rounded">
                      <div className="text-sm font-medium">{NIVEL_NAMES[nivel as keyof typeof NIVEL_NAMES]}</div>
                      <div className="text-lg font-bold text-blue-600">
                        ${(precio / 100).toLocaleString()}
                      </div>
                      <div className="text-xs text-slate-500">MXN</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Asignaciones automáticas */}
        {showAssignment && selectedProductData && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                2. Asignaciones automáticas por nivel académico
              </CardTitle>
              <p className="text-sm text-slate-600 mt-2">
                El sistema asigna automáticamente el precio correcto basado en el grado de cada estudiante
              </p>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {estudiantes.map((estudiante) => {
                  const nivel = getAcademicLevel(estudiante.grado);
                  const precio = selectedProductData.precios_por_nivel[nivel];
                  
                  return (
                    <div key={estudiante.id} className="flex items-center justify-between p-4 bg-white rounded-lg border shadow-sm">
                      <div className="flex-1">
                        <div className="font-medium text-slate-900">{estudiante.nombre}</div>
                        <div className="text-sm text-slate-600">
                          Grado: {estudiante.grado} - Grupo: {estudiante.grupo}
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-4">
                        <div className="text-center">
                          <Badge variant="secondary">{NIVEL_NAMES[nivel]}</Badge>
                          <div className="text-xs text-slate-500 mt-1">Nivel detectado</div>
                        </div>
                        
                        <div className="text-right">
                          <div className="text-lg font-bold text-green-600">
                            ${(precio / 100).toLocaleString()}
                          </div>
                          <div className="text-xs text-slate-500">MXN</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Resumen */}
              <div className="mt-6 p-4 bg-slate-50 rounded-lg">
                <h3 className="font-semibold text-slate-900 mb-3">Resumen de asignaciones</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {Object.entries(
                    estudiantes.reduce((acc, estudiante) => {
                      const nivel = getAcademicLevel(estudiante.grado);
                      const precio = selectedProductData.precios_por_nivel[nivel];
                      
                      if (!acc[nivel]) {
                        acc[nivel] = { count: 0, total: 0, nivel_name: NIVEL_NAMES[nivel] };
                      }
                      acc[nivel].count++;
                      acc[nivel].total += precio;
                      return acc;
                    }, {} as Record<string, {count: number, total: number, nivel_name: string}>)
                  ).map(([nivel, data]) => (
                    <div key={nivel} className="text-center p-3 bg-white rounded">
                      <div className="text-sm font-medium text-slate-700">{data.nivel_name}</div>
                      <div className="text-lg font-bold">{data.count}</div>
                      <div className="text-xs text-slate-500">estudiantes</div>
                      <div className="text-sm font-semibold text-green-600 mt-1">
                        ${(data.total / 100).toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
                
                <div className="mt-4 pt-4 border-t">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold">Total general:</span>
                    <span className="text-xl font-bold text-green-700">
                      ${(estudiantes.reduce((total, estudiante) => {
                        const nivel = getAcademicLevel(estudiante.grado);
                        return total + selectedProductData.precios_por_nivel[nivel];
                      }, 0) / 100).toLocaleString()} MXN
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-6 flex justify-center">
                <Button onClick={applyCharges} className="flex items-center gap-2" size="lg">
                  <CheckCircle className="w-5 h-5" />
                  Aplicar cargos a {estudiantes.length} estudiantes
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Explicación del proceso */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="w-5 h-5" />
              ¿Cómo funciona la asignación automática?
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-semibold mb-2">Mapeo de grados a niveles:</h4>
                  <div className="space-y-2 text-sm">
                    <div><Badge variant="outline">Kinder</Badge>: PRE-K, K1, K2, K3, Preescolar</div>
                    <div><Badge variant="outline">Primaria</Badge>: 1° a 6° grado, Primero a Sexto</div>
                    <div><Badge variant="outline">Secundaria</Badge>: 1° a 3° secundaria, 7° a 9°</div>
                    <div><Badge variant="outline">Bachillerato</Badge>: 1° a 3° preparatoria, 10° a 12°</div>
                  </div>
                </div>
                
                <div>
                  <h4 className="font-semibold mb-2">Proceso automático:</h4>
                  <div className="space-y-2 text-sm">
                    <div>1. Se selecciona un producto del catálogo</div>
                    <div>2. El sistema lee el grado de cada estudiante</div>
                    <div>3. Mapea automáticamente el grado al nivel académico</div>
                    <div>4. Asigna el precio correspondiente a ese nivel</div>
                    <div>5. Genera los cargos con precios diferenciados</div>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}