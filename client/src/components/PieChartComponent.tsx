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

  return (
    <div className="w-full bg-white rounded-lg p-4 shadow-sm border">
      <h3 className="text-lg font-semibold mb-6 text-center text-gray-800">{title}</h3>
      
      {/* Gráfico tipo pastel simple con CSS */}
      <div className="flex justify-center mb-6">
        <div className="relative">
          <div 
            className="w-48 h-48 rounded-full"
            style={{
              background: `conic-gradient(
                ${data.map((item, index) => {
                  const startPercent = data.slice(0, index).reduce((sum, prev) => sum + (prev.value / total) * 100, 0);
                  const endPercent = startPercent + (item.value / total) * 100;
                  return `${item.color} ${startPercent}% ${endPercent}%`;
                }).join(', ')}
              )`
            }}
          >
            {/* Círculo central blanco */}
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-20 h-20 bg-white rounded-full flex flex-col items-center justify-center shadow-md">
              <div className="text-xl font-bold text-gray-800">{total}</div>
              <div className="text-xs text-gray-500">Total</div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Leyenda mejorada */}
      <div className="space-y-3">
        {data.map((item, index) => {
          const percentage = ((item.value / total) * 100).toFixed(1);
          return (
            <div key={item.name} className="flex items-center justify-between p-2 rounded bg-gray-50">
              <div className="flex items-center gap-3">
                <div 
                  className="w-4 h-4 rounded-full shadow-sm" 
                  style={{ backgroundColor: item.color }}
                />
                <span className="text-sm font-medium text-gray-700">{item.name}</span>
              </div>
              <div className="text-right">
                <div className="text-sm font-bold text-gray-800">{item.value}</div>
                <div className="text-xs text-gray-500">{percentage}%</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}