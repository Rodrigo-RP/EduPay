interface PieChartData {
  name: string;
  value: number;
  color: string;
}

interface PieChartComponentProps {
  data: PieChartData[];
  title: string;
}

export function PieChartComponent({ data, title }: PieChartComponentProps) {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  const maxValue = Math.max(...data.map(item => item.value));

  return (
    <div className="w-full">
      <h3 className="text-sm font-medium mb-4 text-center">{title}</h3>
      
      {/* Gráfico de barras horizontales coloridas */}
      <div className="space-y-3 mb-4">
        {data.map((item, index) => {
          const percentage = ((item.value / total) * 100).toFixed(1);
          const barWidth = (item.value / maxValue) * 100;
          
          return (
            <div key={item.name} className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="flex items-center gap-2">
                  <div 
                    className="w-3 h-3 rounded-full" 
                    style={{ backgroundColor: item.color }}
                  />
                  {item.name}
                </span>
                <span className="font-medium">{item.value} ({percentage}%)</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-4 relative overflow-hidden">
                <div 
                  className="h-full rounded-full transition-all duration-300 flex items-center justify-center"
                  style={{ 
                    backgroundColor: item.color, 
                    width: `${barWidth}%`,
                    minWidth: '20px'
                  }}
                >
                  <span className="text-xs font-medium text-white px-2">
                    {item.value}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      
      {/* Resumen total */}
      <div className="text-center">
        <div className="text-lg font-bold text-gray-800">{total}</div>
        <div className="text-xs text-gray-600">Total de Cuentas</div>
      </div>
    </div>
  );
}