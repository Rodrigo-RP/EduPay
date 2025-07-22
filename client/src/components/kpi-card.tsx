import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";

interface KPICardProps {
  icon: LucideIcon;
  label: string;
  value: string;
  change: string;
  changeType: "positive" | "negative" | "neutral";
}

export default function KPICard({ icon: Icon, label, value, change, changeType }: KPICardProps) {
  const changeColorClass = {
    positive: "text-green-600",
    negative: "text-red-600", 
    neutral: "text-slate-500"
  }[changeType];

  const changeIcon = {
    positive: "fas fa-arrow-up",
    negative: "fas fa-arrow-down",
    neutral: ""
  }[changeType];

  return (
    <Card className="shadow-sm border border-slate-200 min-w-0">
      <CardHeader className="flex flex-row items-start justify-between pb-2 space-y-0">
        <CardTitle className="text-xs sm:text-sm font-medium text-slate-600 leading-tight pr-2 flex-1 min-w-0">{label}</CardTitle>
        <div className="w-10 h-10 sm:w-12 sm:h-12 bg-primary-100 rounded-lg flex items-center justify-center flex-shrink-0">
          <Icon className="text-primary-600" size={16} />
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-1">
          <p className="text-xl sm:text-2xl font-bold text-slate-900 break-words leading-tight">{value}</p>
          <p className={`text-xs sm:text-sm ${changeColorClass} flex items-center`}>
            {changeIcon && <i className={`${changeIcon} mr-1 text-xs`}></i>}
            {change}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
