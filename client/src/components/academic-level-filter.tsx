import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function AcademicLevelFilter({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-44" aria-label="Nivel de esta página">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">Todos los niveles</SelectItem>
        <SelectItem value="KINDER">Kinder</SelectItem>
        <SelectItem value="PRIMARIA">Primaria</SelectItem>
        <SelectItem value="SECUNDARIA">Secundaria</SelectItem>
        <SelectItem value="BACHILLERATO">Bachillerato</SelectItem>
      </SelectContent>
    </Select>
  );
}
