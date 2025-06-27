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
  
  // Función para crear un sector del pastel en SVG
  const createPieSlice = (item: PieChartData, index: number, cumulative: number) => {
    const percentage = item.value / total;
    const angle = percentage * 360;
    const startAngle = (cumulative / total) * 360;
    const endAngle = startAngle + angle;
    
    const centerX = 100;
    const centerY = 100;
    const radius = 80;
    
    const startAngleRad = (startAngle * Math.PI) / 180;
    const endAngleRad = (endAngle * Math.PI) / 180;
    
    const x1 = centerX + radius * Math.cos(startAngleRad);
    const y1 = centerY + radius * Math.sin(startAngleRad);
    const x2 = centerX + radius * Math.cos(endAngleRad);
    const y2 = centerY + radius * Math.sin(endAngleRad);
    
    const largeArc = angle > 180 ? 1 : 0;
    
    const pathData = [
      `M ${centerX} ${centerY}`,
      `L ${x1} ${y1}`,
      `A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`,
      'Z'
    ].join(' ');
    
    return (
      <path
        key={index}
        d={pathData}
        fill={item.color}
        stroke="white"
        strokeWidth="2"
        className="hover:opacity-80 transition-opacity cursor-pointer"
      />
    );
  };

  return (
    <div className="w-full">
      <h3 className="text-sm font-medium mb-4 text-center">{title}</h3>
      
      {/* Gráfico tipo pastel SVG */}
      <div className="flex justify-center mb-4">
        <svg width="200" height="200" viewBox="0 0 200 200" className="drop-shadow-md">
          {data.map((item, index) => {
            const cumulative = data.slice(0, index).reduce((sum, prevItem) => sum + prevItem.value, 0);
            return createPieSlice(item, index, cumulative);
          })}
          {/* Círculo central para efecto de dona */}
          <circle
            cx="100"
            cy="100"
            r="35"
            fill="white"
            stroke="#e5e7eb"
            strokeWidth="2"
          />
          <text
            x="100"
            y="95"
            textAnchor="middle"
            className="text-sm font-bold fill-gray-700"
          >
            {total}
          </text>
          <text
            x="100"
            y="110"
            textAnchor="middle"
            className="text-xs fill-gray-500"
          >
            Total
          </text>
        </svg>
      </div>
      
      {/* Leyenda */}
      <div className="space-y-2">
        {data.map((item, index) => {
          const percentage = ((item.value / total) * 100).toFixed(1);
          return (
            <div key={item.name} className="flex justify-between items-center text-xs">
              <span className="flex items-center gap-2">
                <div 
                  className="w-3 h-3 rounded-full border border-gray-300" 
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