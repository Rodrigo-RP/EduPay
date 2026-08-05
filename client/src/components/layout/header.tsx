import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useAcademicFilter, generateCiclosList, getCurrentCiclo } from "@/hooks/use-academic-filter";
import { Calendar, GraduationCap, User, Settings, CalendarDays } from "lucide-react";
import { useLocation } from "wouter";
import { RealTimeStatus } from "@/components/RealTimeStatus";
import GlobalSearch from "@/components/GlobalSearch";

const PERIODOS = [
  { value: "hoy",    label: "Hoy"         },
  { value: "semana", label: "Esta semana"  },
  { value: "mes",    label: "Este mes"     },
  { value: "ciclo",  label: "Este ciclo"   },
];

export default function Header() {
  const { user, guardian } = useAuth();
  const { selectedCiclo, selectedNivel, selectedPeriodo, setSelectedCiclo, setSelectedNivel, setSelectedPeriodo } = useAcademicFilter();
  const [location, setLocation] = useLocation();

  // En Alumnos y Familias el buscador vive dentro de la página; no duplicar en el header
  const hideGlobalSearch = location === "/estudiantes" || location === "/familias";

  const ciclosEscolares = generateCiclosList();

  const nivelesEscolares = [
    { value: "all", label: "Todos los niveles" },
    { value: "KINDER", label: "Kinder" },
    { value: "PRIMARIA", label: "Primaria" },
    { value: "SECUNDARIA", label: "Secundaria" },
    { value: "BACHILLERATO", label: "Bachillerato" }
  ];

  return (
    <header className="bg-white border-b border-slate-200 h-16 flex-shrink-0">
      <div className="px-6 py-3 flex items-center justify-end h-full">
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

          {/* Selector de Período */}
          <div className="flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-slate-500" />
            <span className="text-xs text-slate-600">Período:</span>
            <Select value={selectedPeriodo} onValueChange={setSelectedPeriodo}>
              <SelectTrigger className="w-32 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PERIODOS.map(p => (
                  <SelectItem key={p.value} value={p.value} className="text-xs">
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Buscador universal — oculto en páginas que tienen su propio buscador */}
          {!hideGlobalSearch && <GlobalSearch />}

          <RealTimeStatus />
          
          <Button
            variant="ghost"
            size="sm"
            className="text-right p-2 hover:bg-slate-100 rounded-lg transition-colors"
            onClick={() => setLocation('/profile')}
          >
            <div className="flex items-center gap-3">
              {/* Profile Photo */}
              <div className="w-8 h-8 bg-slate-200 rounded-full flex items-center justify-center overflow-hidden">
                {(user?.foto_url || guardian?.foto_url) ? (
                  <img 
                    src={user?.foto_url || guardian?.foto_url} 
                    alt="Profile" 
                    className="w-full h-full object-cover" 
                  />
                ) : (
                  <User className="w-4 h-4 text-slate-500" />
                )}
              </div>
              
              {/* User Info */}
              <div className="text-right">
                <p className="text-sm font-medium text-slate-900">
                  {user?.email || guardian?.email}
                </p>
                <p className="text-xs text-slate-500">
                  {user ? (user.role === 'administrador_general' ? 'Administrador General' : 
                          user.role === 'administrador_campus' ? 'Administrador Campus' :
                          user.role === 'contador_general' ? 'Contador General' :
                          user.role === 'auxiliar_contable' ? 'Auxiliar Contable' :
                          user.role === 'admisiones' ? 'Admisiones' :
                          user.role === 'asistente' ? 'Asistente' :
                          'Administrador') : "Padre/Tutor"}
                </p>
              </div>

              {/* Settings Icon */}
              <Settings className="w-4 h-4 text-slate-400" />
            </div>
          </Button>
        </div>
      </div>
    </header>
  );
}