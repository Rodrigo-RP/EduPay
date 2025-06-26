import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, FileSpreadsheet, Users, Link } from "lucide-react";

export default function ImportRelationshipGuide() {
  return (
    <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950 dark:border-blue-800">
      <CardHeader>
        <CardTitle className="text-blue-900 dark:text-blue-100 flex items-center gap-2">
          <Link className="h-5 w-5" />
          Sistema de Vinculación Familiar
        </CardTitle>
      </CardHeader>
      <CardContent className="text-blue-800 dark:text-blue-200">
        <div className="space-y-6">
          {/* Proceso paso a paso */}
          <div className="grid md:grid-cols-3 gap-4">
            <div className="text-center space-y-2">
              <div className="bg-blue-600 text-white rounded-full w-8 h-8 flex items-center justify-center text-sm font-bold mx-auto">1</div>
              <FileSpreadsheet className="h-8 w-8 mx-auto text-blue-600" />
              <h4 className="font-semibold">Estudiantes.xlsx</h4>
              <p className="text-xs">CURP único por alumno</p>
            </div>
            <div className="text-center space-y-2">
              <div className="bg-blue-600 text-white rounded-full w-8 h-8 flex items-center justify-center text-sm font-bold mx-auto">2</div>
              <Users className="h-8 w-8 mx-auto text-blue-600" />
              <h4 className="font-semibold">Tutores.xlsx</h4>
              <p className="text-xs">Email único por responsable</p>
            </div>
            <div className="text-center space-y-2">
              <div className="bg-blue-600 text-white rounded-full w-8 h-8 flex items-center justify-center text-sm font-bold mx-auto">3</div>
              <Link className="h-8 w-8 mx-auto text-blue-600" />
              <h4 className="font-semibold">Relaciones.xlsx</h4>
              <p className="text-xs">Conecta CURP con email</p>
            </div>
          </div>

          {/* Ejemplo práctico */}
          <div className="bg-white dark:bg-blue-900 rounded-lg p-4 border border-blue-300 dark:border-blue-700">
            <h5 className="font-semibold mb-3">Ejemplo Práctico de Vinculación:</h5>
            
            <div className="space-y-4">
              {/* Archivo Estudiantes */}
              <div>
                <Badge variant="outline" className="mb-2">Estudiantes.xlsx</Badge>
                <div className="bg-gray-50 dark:bg-gray-800 p-2 rounded text-xs font-mono">
                  <div className="grid grid-cols-4 gap-2 font-semibold border-b pb-1">
                    <span>CURP</span>
                    <span>Nombre</span>
                    <span>Grado</span>
                    <span>Grupo</span>
                  </div>
                  <div className="grid grid-cols-4 gap-2 pt-1">
                    <span>GOLM051215MDFNPR03</span>
                    <span>María González</span>
                    <span>3°</span>
                    <span>A</span>
                  </div>
                </div>
              </div>

              {/* Archivo Tutores */}
              <div>
                <Badge variant="outline" className="mb-2">Tutores.xlsx</Badge>
                <div className="bg-gray-50 dark:bg-gray-800 p-2 rounded text-xs font-mono">
                  <div className="grid grid-cols-4 gap-2 font-semibold border-b pb-1">
                    <span>Email</span>
                    <span>Nombre</span>
                    <span>Teléfono</span>
                    <span>Relación</span>
                  </div>
                  <div className="grid grid-cols-4 gap-2 pt-1">
                    <span>roberto@email.com</span>
                    <span>Roberto González</span>
                    <span>5551234567</span>
                    <span>Padre</span>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    <span>carmen@email.com</span>
                    <span>Carmen López</span>
                    <span>5559876543</span>
                    <span>Madre</span>
                  </div>
                </div>
              </div>

              {/* Archivo Relaciones */}
              <div>
                <Badge variant="outline" className="mb-2">Relaciones.xlsx</Badge>
                <div className="bg-gray-50 dark:bg-gray-800 p-2 rounded text-xs font-mono">
                  <div className="grid grid-cols-4 gap-2 font-semibold border-b pb-1">
                    <span>CURP Estudiante</span>
                    <span>Email Tutor</span>
                    <span>Responsable Pago</span>
                    <span>Autorización</span>
                  </div>
                  <div className="grid grid-cols-4 gap-2 pt-1">
                    <span>GOLM051215MDFNPR03</span>
                    <span>roberto@email.com</span>
                    <span>SÍ</span>
                    <span>Recoger</span>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    <span>GOLM051215MDFNPR03</span>
                    <span>carmen@email.com</span>
                    <span>NO</span>
                    <span>Emergencia</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 p-3 bg-green-50 dark:bg-green-900 rounded border border-green-300 dark:border-green-700">
              <h6 className="font-semibold text-green-800 dark:text-green-200 mb-1">Resultado:</h6>
              <p className="text-sm text-green-700 dark:text-green-300">
                María González queda vinculada con Roberto (responsable de pago) y Carmen (contacto de emergencia)
              </p>
            </div>
          </div>

          {/* Reglas importantes */}
          <div className="bg-yellow-50 dark:bg-yellow-900 p-3 rounded border border-yellow-300 dark:border-yellow-700">
            <h6 className="font-semibold text-yellow-800 dark:text-yellow-200 mb-2">Reglas Importantes:</h6>
            <ul className="text-sm text-yellow-700 dark:text-yellow-300 space-y-1">
              <li>• Cada estudiante debe tener un CURP único</li>
              <li>• Cada tutor debe tener un email único</li>
              <li>• Un estudiante puede tener múltiples tutores</li>
              <li>• Solo UN tutor por estudiante puede ser "responsable de pago"</li>
              <li>• El sistema valida que CURP y email existan antes de crear la relación</li>
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}