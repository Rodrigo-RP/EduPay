import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Calendar, CheckCircle, AlertTriangle, Settings, FileText } from "lucide-react";
import { SEP_NON_WORKING_DAYS_2025_2026, isBusinessDay, adjustPaymentDateToBusinessDay } from "@shared/payment-rules";
import { format, addDays } from "date-fns";
import { es } from "date-fns/locale";

export default function CalendarIntegrationPage() {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  
  const testDate = adjustPaymentDateToBusinessDay(selectedDate);
  const isOriginalBusinessDay = isBusinessDay(selectedDate);
  
  const upcomingHolidays = SEP_NON_WORKING_DAYS_2025_2026
    .filter(date => date >= new Date())
    .slice(0, 10)
    .map(date => ({
      date,
      formattedDate: format(date, "dd 'de' MMMM 'de' yyyy", { locale: es }),
      dayOfWeek: format(date, "EEEE", { locale: es })
    }));

  const paymentDateExamples = [
    new Date(2025, 11, 25), // Christmas
    new Date(2026, 0, 1),   // New Year
    new Date(2025, 8, 16),  // Independence Day
    new Date(2025, 10, 3),  // Day of the Dead
    new Date(2026, 1, 2),   // Constitution Day
  ].map(date => ({
    originalDate: date,
    adjustedDate: adjustPaymentDateToBusinessDay(date),
    isAdjusted: !isBusinessDay(date)
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Integración Calendario SEP</h1>
          <p className="text-muted-foreground">
            Sistema automático de ajuste de fechas de pago según calendario oficial
          </p>
        </div>
        <Badge variant="default" className="bg-green-100 text-green-800">
          <CheckCircle className="h-3 w-3 mr-1" />
          Integrado SEP 2025-2026
        </Badge>
      </div>

      <Alert>
        <Calendar className="h-4 w-4" />
        <AlertDescription>
          <strong>Ajuste Automático:</strong> Cuando una fecha de vencimiento cae en día no laborable, 
          el sistema la mueve automáticamente al siguiente día hábil sin generar recargos por mora.
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Calendar Test */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Prueba de Fechas
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium">Selecciona una fecha:</label>
              <input
                type="date"
                value={format(selectedDate, 'yyyy-MM-dd')}
                onChange={(e) => setSelectedDate(new Date(e.target.value))}
                className="w-full p-2 border rounded-md mt-1"
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <span className="font-medium">Fecha original:</span>
                <span>{format(selectedDate, "dd/MM/yyyy", { locale: es })}</span>
              </div>
              
              <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                <span className="font-medium">Fecha ajustada:</span>
                <div className="text-right">
                  <span className="font-medium">{format(testDate, "dd/MM/yyyy", { locale: es })}</span>
                  <br />
                  <span className="text-xs text-muted-foreground">
                    {format(testDate, "EEEE", { locale: es })}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {isOriginalBusinessDay ? (
                  <Badge variant="default" className="bg-green-100 text-green-800">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Día hábil
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="bg-orange-100 text-orange-800">
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    Día no laborable
                  </Badge>
                )}
                
                {!isOriginalBusinessDay && (
                  <span className="text-sm text-muted-foreground">
                    Ajustado automáticamente
                  </span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Holiday Calendar */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Próximos Días No Laborables
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {upcomingHolidays.map((holiday, index) => (
                <div key={index} className="flex items-center justify-between p-2 border rounded-lg">
                  <div>
                    <div className="font-medium">{holiday.formattedDate}</div>
                    <div className="text-xs text-muted-foreground capitalize">
                      {holiday.dayOfWeek}
                    </div>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    SEP Oficial
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Payment Date Examples */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Ejemplos de Ajuste Automático
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-3">Fecha Original de Vencimiento</th>
                  <th className="text-left p-3">Día de la Semana</th>
                  <th className="text-left p-3">Fecha Ajustada</th>
                  <th className="text-left p-3">Estado</th>
                </tr>
              </thead>
              <tbody>
                {paymentDateExamples.map((example, index) => (
                  <tr key={index} className="border-b">
                    <td className="p-3">
                      {format(example.originalDate, "dd/MM/yyyy", { locale: es })}
                    </td>
                    <td className="p-3 capitalize">
                      {format(example.originalDate, "EEEE", { locale: es })}
                    </td>
                    <td className="p-3">
                      <div className={example.isAdjusted ? "font-medium text-blue-600" : ""}>
                        {format(example.adjustedDate, "dd/MM/yyyy", { locale: es })}
                      </div>
                      {example.isAdjusted && (
                        <div className="text-xs text-muted-foreground">
                          {format(example.adjustedDate, "EEEE", { locale: es })}
                        </div>
                      )}
                    </td>
                    <td className="p-3">
                      {example.isAdjusted ? (
                        <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                          Ajustado
                        </Badge>
                      ) : (
                        <Badge variant="default" className="bg-green-100 text-green-800">
                          Sin ajuste
                        </Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          <div className="mt-4 text-xs text-muted-foreground">
            * Fechas ajustadas no generan recargos por mora. El período de gracia se mantiene desde la fecha ajustada.
          </div>
        </CardContent>
      </Card>

      {/* Benefits */}
      <Card>
        <CardHeader>
          <CardTitle>Beneficios del Sistema</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center p-4 border rounded-lg">
              <CheckCircle className="h-8 w-8 text-green-600 mx-auto mb-2" />
              <h3 className="font-semibold mb-1">Cumplimiento Legal</h3>
              <p className="text-xs text-muted-foreground">
                Respeta el calendario oficial SEP automáticamente
              </p>
            </div>
            <div className="text-center p-4 border rounded-lg">
              <Settings className="h-8 w-8 text-blue-600 mx-auto mb-2" />
              <h3 className="font-semibold mb-1">Automatización</h3>
              <p className="text-xs text-muted-foreground">
                No requiere intervención manual para ajustes
              </p>
            </div>
            <div className="text-center p-4 border rounded-lg">
              <AlertTriangle className="h-8 w-8 text-orange-600 mx-auto mb-2" />
              <h3 className="font-semibold mb-1">Sin Penalizaciones</h3>
              <p className="text-xs text-muted-foreground">
                Evita recargos injustos en días no laborables
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}