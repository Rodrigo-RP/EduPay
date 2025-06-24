import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2 } from "lucide-react";

interface Tenant {
  id: number;
  nombre_legal: string;
  rfc: string;
}

interface TenantSelectorProps {
  tenants: Tenant[];
  currentTenant: number;
  onTenantChange: (tenantId: number) => void;
}

export default function TenantSelector({ tenants, currentTenant, onTenantChange }: TenantSelectorProps) {
  return (
    <div className="flex items-center gap-2 p-4 border-b">
      <Building2 className="w-5 h-5 text-blue-600" />
      <Select value={currentTenant.toString()} onValueChange={(value) => onTenantChange(Number(value))}>
        <SelectTrigger className="w-64">
          <SelectValue placeholder="Seleccionar institución" />
        </SelectTrigger>
        <SelectContent>
          {tenants.map((tenant) => (
            <SelectItem key={tenant.id} value={tenant.id.toString()}>
              <div className="flex flex-col">
                <span className="font-medium">{tenant.nombre_legal}</span>
                <span className="text-xs text-gray-500">RFC: {tenant.rfc}</span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}