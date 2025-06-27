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
    <div className="w-full">
      <h3 className="text-sm font-medium mb-4 text-center">{title}</h3>
      
      {/* Gráfico tipo pastel usando CSS conic-gradient */}
      <div className="flex justify-center mb-4">
        <div 
          className="w-32 h-32 rounded-full relative"
          style={{
            background: `conic-gradient(
              ${data.map((item, index) => {
                const percentage = (item.value / total) * 100;
                const prevPercentage = data.slice(0, index).reduce((sum, prevItem) => sum + (prevItem.value / total) * 100, 0);
                return `${item.color} ${prevPercentage}% ${prevPercentage + percentage}%`;
              }).join(', ')}
            )`
          }}
        >
          {/* Círculo interno para crear efecto de dona */}
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-16 h-16 bg-white rounded-full flex items-center justify-center">
            <span className="text-xs font-medium text-gray-600">{total}</span>
          </div>
        </div>
      </div>
      
      {/* Leyenda */}
      <div className="space-y-2">
        {data.map((item, index) => {
          const percentage = ((item.value / total) * 100).toFixed(1);
          return (
            <div key={item.name} className="flex justify-between items-center text-xs">
              <span className="flex items-center gap-2">
                <div 
                  className="w-3 h-3 rounded-full" 
                  style={{ backgroundColor: item.color }}
                />
                {item.name}
              </span>
              <span className="font-medium">{item.value} ({percentage}%)</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}