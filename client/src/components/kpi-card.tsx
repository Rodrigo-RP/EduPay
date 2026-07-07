import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";

interface KPICardProps {
  icon: LucideIcon;
  label: string;
  value: string;
  change?: string;
  changeType?: "positive" | "negative" | "neutral";
}

export default function KPICard({ icon: Icon, label, value, change, changeType }: KPICardProps) {
  const changeColorClass = changeType ? {
    positive: "text-green-600",
    negative: "text-red-600", 
    neutral: "text-slate-500"
  }[changeType] : "";

  const changeIcon = changeType ? {
    positive: "fas fa-arrow-up",
    negative: "fas fa-arrow-down",
    neutral: ""
  }[changeType] : "";

  return (
    <Card className="shadow-sm border border-slate-200">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-slate-600 flex-1 pr-2">{label}</CardTitle>
        <div className="w-12 h-12 bg-primary-100 rounded-lg flex items-center justify-center flex-shrink-0">
          <Icon className="text-primary-600" size={20} />
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        <div className="space-y-1">
          <p className="text-2xl font-bold text-slate-900 leading-tight" title={value}>{value}</p>
          {change && (
            <p className={`text-sm ${changeColorClass} flex items-center`}>
              {changeIcon && <i className={`${changeIcon} mr-1 text-xs`}></i>}
              {change}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
