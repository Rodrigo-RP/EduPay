import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import { useAcademicFilter } from "@/hooks/use-academic-filter";
import { Calendar, GraduationCap } from "lucide-react";

export default function Header() {
  const { user } = useAuth();
  const { selectedCiclo, selectedNivel, setSelectedCiclo, setSelectedNivel } = useAcademicFilter();

  const ciclosEscolares = [
    "2024-2025",
    "2023-2024", 
    "2022-2023",
    "2025-2026"
  ];

  const nivelesEscolares = [
    { value: "all", label: "Todos los niveles" },
    { value: "KINDER", label: "Kinder" },
    { value: "PRIMARIA", label: "Primaria" },
    { value: "SECUNDARIA", label: "Secundaria" },
    { value: "BACHILLERATO", label: "Bachillerato" }
  ];

  return (
    <header className="fixed top-0 left-64 right-0 bg-white border-b border-slate-200 z-40 h-16">
      <div className="px-6 py-3 flex items-center justify-between h-full">
        <div className="flex items-center gap-4">
          <div>
            <h2 className="font-semibold text-slate-900">Colegio San Patricio</h2>
            <p className="text-sm text-slate-600">Campus Principal • SaaS Multi-tenant</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          {/* Selector de Ciclo Escolar */}
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-slate-500" />
            <span className="text-xs text-slate-600">Ciclo:</span>
            <Select value={selectedCiclo} onValueChange={setSelectedCiclo}>
              <SelectTrigger className="w-32 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ciclosEscolares.map(ciclo => (
                  <SelectItem key={ciclo} value={ciclo} className="text-xs">
                    {ciclo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Selector de Nivel Escolar */}
          <div className="flex items-center gap-2">
            <GraduationCap className="w-4 h-4 text-slate-500" />
            <span className="text-xs text-slate-600">Nivel:</span>
            <Select value={selectedNivel} onValueChange={setSelectedNivel}>
              <SelectTrigger className="w-36 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {nivelesEscolares.map(nivel => (
                  <SelectItem key={nivel.value} value={nivel.value} className="text-xs">
                    {nivel.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Badge className="bg-green-100 text-green-800 text-xs">
            Sistema Activo
          </Badge>
          
          <div className="text-right">
            <p className="text-sm font-medium text-slate-900">{user?.email}</p>
            <p className="text-xs text-slate-500">Administrador</p>
          </div>
        </div>
      </div>
    </header>
  );
}