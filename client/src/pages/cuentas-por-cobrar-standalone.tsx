import React, { useState } from "react";

// CSS embebido para standalone
const embeddedCSS = `
  .container { padding: 24px; max-width: 1200px; margin: 0 auto; font-family: system-ui, -apple-system, sans-serif; }
  .header { margin-bottom: 32px; }
  .title { font-size: 2rem; font-weight: bold; color: #1f2937; margin: 0; }
  .metrics-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 24px; margin-bottom: 32px; }
  .metric-card { background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
  .metric-header { display: flex; justify-content: between; align-items: center; margin-bottom: 8px; }
  .metric-title { font-size: 0.875rem; font-weight: 500; color: #6b7280; }
  .metric-value { font-size: 1.875rem; font-weight: bold; color: #1f2937; }
  .metric-sub { font-size: 0.75rem; color: #9ca3af; margin-top: 4px; }
  .tabs { background: white; border: 1px solid #e5e7eb; border-radius: 8px; }
  .tabs-header { display: flex; border-bottom: 1px solid #e5e7eb; }
  .tab-button { padding: 12px 24px; border: none; background: none; cursor: pointer; font-weight: 500; }
  .tab-button.active { background: #eff6ff; border-bottom: 2px solid #2563eb; color: #2563eb; }
  .tab-content { padding: 24px; }
  .filter-section { background: #f9fafb; padding: 20px; border-radius: 8px; margin-bottom: 24px; }
  .filter-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; }
  .form-group { display: flex; flex-direction: column; }
  .form-label { font-size: 0.875rem; font-weight: 500; margin-bottom: 4px; color: #374151; }
  .form-input { padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 0.875rem; }
  .table { width: 100%; border-collapse: collapse; margin-top: 16px; }
  .table th, .table td { padding: 12px; text-align: left; border-bottom: 1px solid #e5e7eb; }
  .table th { background: #f9fafb; font-weight: 600; color: #374151; }
  .badge { display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 500; }
  .badge-red { background: #fee2e2; color: #dc2626; }
  .badge-yellow { background: #fef3c7; color: #d97706; }
  .badge-green { background: #dcfce7; color: #16a34a; }
  .reports-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; }
  .report-card { background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; }
  .report-title { font-weight: 600; margin-bottom: 8px; color: #1f2937; }
  .report-desc { color: #6b7280; font-size: 0.875rem; margin-bottom: 16px; }
  .button { padding: 8px 16px; border: none; border-radius: 6px; cursor: pointer; font-weight: 500; }
  .button-primary { background: #2563eb; color: white; }
  .button-secondary { background: #f3f4f6; color: #374151; border: 1px solid #d1d5db; }
  .button:hover { opacity: 0.9; }
  .metric-red { color: #dc2626; }
  .metric-green { color: #16a34a; }
`;

export default function CuentasPorCobrarStandalone() {
  const [activeTab, setActiveTab] = useState("lista");
  const [filtros, setFiltros] = useState({
    fechaInicio: "",
    fechaFin: "",
    estudiante: "",
    formato: "detallado"
  });

  // Datos de ejemplo
  const cuentas = [
    {
      id: 1,
      estudiante: "María González Pérez",
      nivel_academico: "Primaria",
      concepto: "Colegiatura",
      pendiente_pagar_centavos: 280000,
      estado_cobranza: "Vencido",
      dias_vencido: 15,
      familia: "González Pérez"
    },
    {
      id: 2,
      estudiante: "Juan Carlos Morales",
      nivel_academico: "Secundaria", 
      concepto: "Inscripción",
      pendiente_pagar_centavos: 320000,
      estado_cobranza: "Por vencer",
      dias_vencido: 0,
      familia: "Morales Ruiz"
    },
    {
      id: 3,
      estudiante: "Ana Sofía Ramírez",
      nivel_academico: "Kinder",
      concepto: "Colegiatura", 
      pendiente_pagar_centavos: 250000,
      estado_cobranza: "Al corriente",
      dias_vencido: 0,
      familia: "Ramírez López"
    }
  ];

  const reportes = [
    { nombre: "Antigüedad de Saldos", descripcion: "Análisis detallado de cuentas por antigüedad" },
    { nombre: "Cartera Vencida", descripcion: "Reporte de pagos vencidos y morosidad" },
    { nombre: "Eficiencia de Cobranza", descripcion: "Métricas de efectividad en recuperación" },
    { nombre: "Seguimiento de Promesas", descripcion: "Control de compromisos de pago" },
    { nombre: "Análisis de Morosidad", descripcion: "Estudio de patrones de morosidad" },
    { nombre: "Reporte Ejecutivo", descripcion: "Resumen ejecutivo para directivos" }
  ];

  const formatCurrency = (centavos: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN'
    }).format(centavos / 100);
  };

  const totalPorCobrar = cuentas.reduce((sum, c) => sum + c.pendiente_pagar_centavos, 0);
  const cuentasVencidas = cuentas.filter(c => c.estado_cobranza === "Vencido").length;

  const generarReportePDF = (nombreReporte: string) => {
    const logoFallback = `<div style="width: 80px; height: 80px; margin-right: 20px; background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 24px;">JFR</div>`;
    
    const reporteHTML = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Reporte - ${nombreReporte}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; line-height: 1.6; }
          .header { display: flex; align-items: center; margin-bottom: 30px; border-bottom: 2px solid #2563eb; padding-bottom: 20px; }
          .institution-info h1 { color: #1e40af; margin: 0; font-size: 24px; }
          .institution-info p { color: #64748b; margin: 5px 0; }
          .report-title { text-align: center; color: #1e40af; font-size: 20px; margin: 20px 0; }
          .metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin: 30px 0; }
          .metric-card { border: 1px solid #e2e8f0; padding: 15px; border-radius: 8px; text-align: center; }
          .metric-value { font-size: 24px; font-weight: bold; color: #1e40af; }
          .metric-label { color: #64748b; font-size: 14px; }
          .table { width: 100%; border-collapse: collapse; margin: 20px 0; }
          .table th, .table td { border: 1px solid #e2e8f0; padding: 10px; text-align: left; }
          .table th { background-color: #f8fafc; color: #1e40af; font-weight: bold; }
          .footer { margin-top: 40px; text-align: center; color: #64748b; font-size: 12px; border-top: 1px solid #e2e8f0; padding-top: 20px; }
          @media print { .no-print { display: none !important; } }
        </style>
      </head>
      <body>
        <div class="header">
          ${logoFallback}
          <div class="institution-info">
            <h1>Instituto JFR</h1>
            <p>RFC: IJF180615AB3</p>
            <p>Reporte generado: ${new Date().toLocaleDateString('es-MX')}</p>
          </div>
        </div>
        
        <h2 class="report-title">${nombreReporte}</h2>
        
        <div class="metrics">
          <div class="metric-card">
            <div class="metric-value">${formatCurrency(totalPorCobrar)}</div>
            <div class="metric-label">Total por Cobrar</div>
          </div>
          <div class="metric-card">
            <div class="metric-value">${cuentas.length}</div>
            <div class="metric-label">Total Cuentas</div>
          </div>
          <div class="metric-card">
            <div class="metric-value">${cuentasVencidas}</div>
            <div class="metric-label">Cuentas Vencidas</div>
          </div>
          <div class="metric-card">
            <div class="metric-value">73.2%</div>
            <div class="metric-label">Tasa Recuperación</div>
          </div>
        </div>
        
        <table class="table">
          <thead>
            <tr>
              <th>Estudiante</th>
              <th>Nivel</th>
              <th>Concepto</th>
              <th>Pendiente</th>
              <th>Estado</th>
              <th>Días Vencido</th>
            </tr>
          </thead>
          <tbody>
            ${cuentas.map(cuenta => `
              <tr>
                <td>${cuenta.estudiante}</td>
                <td>${cuenta.nivel_academico}</td>
                <td>${cuenta.concepto}</td>
                <td>${formatCurrency(cuenta.pendiente_pagar_centavos)}</td>
                <td>${cuenta.estado_cobranza}</td>
                <td>${cuenta.dias_vencido}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        
        <div class="footer">
          <p>Documento generado por Edupay - Sistema de Gestión Escolar</p>
          <p>Fecha y hora: ${new Date().toLocaleString('es-MX')}</p>
        </div>
      </body>
      </html>
    `;

    const ventana = window.open('', '_blank');
    if (ventana) {
      ventana.document.write(reporteHTML);
      ventana.document.close();
      ventana.print();
    }

    alert(`Reporte generado: ${nombreReporte} listo para descarga`);
  };

  const limpiarFiltros = () => {
    setFiltros({
      fechaInicio: "",
      fechaFin: "", 
      estudiante: "",
      formato: "detallado"
    });
  };

  const hayFiltrosActivos = filtros.fechaInicio || filtros.fechaFin || filtros.estudiante || filtros.formato !== "detallado";

  return (
    <div>
      <style>{embeddedCSS}</style>
      
      <div className="container">
        <div className="header">
          <h1 className="title">Cuentas por Cobrar</h1>
        </div>

        {/* Métricas principales */}
        <div className="metrics-grid">
          <div className="metric-card">
            <div className="metric-header">
              <div className="metric-title">Total por Cobrar</div>
            </div>
            <div className="metric-value">{formatCurrency(totalPorCobrar)}</div>
            <div className="metric-sub">+2.5% desde el mes pasado</div>
          </div>

          <div className="metric-card">
            <div className="metric-header">
              <div className="metric-title">Cuentas Activas</div>
            </div>
            <div className="metric-value">{cuentas.length}</div>
            <div className="metric-sub">Total de cuentas</div>
          </div>

          <div className="metric-card">
            <div className="metric-header">
              <div className="metric-title">Cuentas Vencidas</div>
            </div>
            <div className="metric-value metric-red">{cuentasVencidas}</div>
            <div className="metric-sub">Requieren seguimiento</div>
          </div>

          <div className="metric-card">
            <div className="metric-header">
              <div className="metric-title">Tasa de Recuperación</div>
            </div>
            <div className="metric-value metric-green">73.2%</div>
            <div className="metric-sub">Eficiencia de cobranza</div>
          </div>
        </div>

        <div className="tabs">
          <div className="tabs-header">
            <button 
              className={`tab-button ${activeTab === "lista" ? "active" : ""}`}
              onClick={() => setActiveTab("lista")}
            >
              Lista de Cuentas
            </button>
            <button 
              className={`tab-button ${activeTab === "seguimiento" ? "active" : ""}`}
              onClick={() => setActiveTab("seguimiento")}
            >
              Seguimiento
            </button>
            <button 
              className={`tab-button ${activeTab === "reportes" ? "active" : ""}`}
              onClick={() => setActiveTab("reportes")}
            >
              Reportes
            </button>
          </div>

          <div className="tab-content">
            {activeTab === "lista" && (
              <div>
                {/* Filtros */}
                <div className="filter-section">
                  <h3 style={{margin: "0 0 16px 0", color: "#374151"}}>🔍 Filtros Avanzados</h3>
                  <div className="filter-grid">
                    <div className="form-group">
                      <label className="form-label">Fecha Inicio</label>
                      <input
                        type="date"
                        className="form-input"
                        value={filtros.fechaInicio}
                        onChange={(e) => setFiltros({...filtros, fechaInicio: e.target.value})}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Fecha Fin</label>
                      <input
                        type="date"
                        className="form-input"
                        value={filtros.fechaFin}
                        onChange={(e) => setFiltros({...filtros, fechaFin: e.target.value})}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Buscar Estudiante/Familia</label>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="Nombre del estudiante o familia"
                        value={filtros.estudiante}
                        onChange={(e) => setFiltros({...filtros, estudiante: e.target.value})}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Formato</label>
                      <select 
                        className="form-input"
                        value={filtros.formato}
                        onChange={(e) => setFiltros({...filtros, formato: e.target.value})}
                      >
                        <option value="detallado">Detallado</option>
                        <option value="ejecutivo">Ejecutivo</option>
                        <option value="auditoria">Auditoría</option>
                      </select>
                    </div>
                  </div>
                  
                  {hayFiltrosActivos && (
                    <div style={{marginTop: "16px", textAlign: "right"}}>
                      <button className="button button-secondary" onClick={limpiarFiltros}>
                        ❌ Limpiar Filtros
                      </button>
                    </div>
                  )}
                </div>

                {/* Tabla de cuentas */}
                <table className="table">
                  <thead>
                    <tr>
                      <th>Estudiante</th>
                      <th>Nivel</th>
                      <th>Concepto</th>
                      <th>Pendiente</th>
                      <th>Estado</th>
                      <th>Días Vencido</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cuentas.map((cuenta) => (
                      <tr key={cuenta.id}>
                        <td>{cuenta.estudiante}</td>
                        <td>{cuenta.nivel_academico}</td>
                        <td>{cuenta.concepto}</td>
                        <td style={{fontWeight: "600"}}>{formatCurrency(cuenta.pendiente_pagar_centavos)}</td>
                        <td>
                          <span className={`badge ${
                            cuenta.estado_cobranza === "Vencido" ? "badge-red" : 
                            cuenta.estado_cobranza === "Por vencer" ? "badge-yellow" : "badge-green"
                          }`}>
                            {cuenta.estado_cobranza}
                          </span>
                        </td>
                        <td>{cuenta.dias_vencido}</td>
                        <td>
                          <button className="button button-secondary">👁️</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {activeTab === "seguimiento" && (
              <div>
                <h3>Seguimiento de Cobranza</h3>
                <p style={{color: "#6b7280"}}>Herramientas de seguimiento y gestión de cobranza en desarrollo.</p>
              </div>
            )}

            {activeTab === "reportes" && (
              <div>
                <h3 style={{marginBottom: "20px"}}>Reportes Especializados</h3>
                <div className="reports-grid">
                  {reportes.map((reporte, index) => (
                    <div key={index} className="report-card">
                      <div className="report-title">{reporte.nombre}</div>
                      <div className="report-desc">{reporte.descripcion}</div>
                      <div style={{display: "flex", gap: "8px"}}>
                        <button 
                          className="button button-primary"
                          onClick={() => generarReportePDF(reporte.nombre)}
                          style={{flex: 1}}
                        >
                          📥 Descargar
                        </button>
                        <button 
                          className="button button-secondary"
                          onClick={() => alert(`Mostrando vista previa de ${reporte.nombre}`)}
                        >
                          👁️
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}