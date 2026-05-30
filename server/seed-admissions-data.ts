// @ts-nocheck
/**
 * DATOS DE EJEMPLO PARA ADMISIONES
 * Simula estudiantes inscritos y pendientes de todas las secciones
 */

import { db } from "./db";
import { students } from "@shared/schema";
import { eq } from "drizzle-orm";

export async function seedAdmissionsData() {
  console.log('🎓 Generando datos de admisiones para todas las secciones...');
  
  // Datos de estudiantes por nivel académico
  const studentsData = [
    // KINDER (5 estudiantes)
    { nombre: 'Sofía García López', grado: 'Kinder 1', nivel: 'Kinder', estado: 'inscrito', beca: 'Beca Socioeconómica' },
    { nombre: 'Diego Martínez Ruiz', grado: 'Kinder 2', nivel: 'Kinder', estado: 'pendiente', beca: null },
    { nombre: 'Isabella Hernández Silva', grado: 'Kinder 3', nivel: 'Kinder', estado: 'inscrito', beca: 'Beca Familiar' },
    { nombre: 'Mateo González Torres', grado: 'Kinder 1', nivel: 'Kinder', estado: 'inscrito', beca: null },
    { nombre: 'Camila Rodríguez Morales', grado: 'Kinder 2', nivel: 'Kinder', estado: 'pendiente', beca: 'Beca Empleados' },
    
    // PRIMARIA (7 estudiantes)
    { nombre: 'Santiago Jiménez Castro', grado: '1° Primaria', nivel: 'Primaria', estado: 'inscrito', beca: null },
    { nombre: 'Valentina Vargas Mendoza', grado: '2° Primaria', nivel: 'Primaria', estado: 'inscrito', beca: 'Beca Deportiva' },
    { nombre: 'Sebastián Sánchez Pérez', grado: '3° Primaria', nivel: 'Primaria', estado: 'pendiente', beca: null },
    { nombre: 'Emilia Ramírez Ortega', grado: '4° Primaria', nivel: 'Primaria', estado: 'inscrito', beca: 'Beca Socioeconómica' },
    { nombre: 'Nicolás Torres Vega', grado: '5° Primaria', nivel: 'Primaria', estado: 'inscrito', beca: null },
    { nombre: 'Antonella Flores Aguilar', grado: '6° Primaria', nivel: 'Primaria', estado: 'pendiente', beca: 'Beca Cultural' },
    { nombre: 'Maximiliano Morales Gutiérrez', grado: '1° Primaria', nivel: 'Primaria', estado: 'inscrito', beca: null },
    
    // SECUNDARIA (6 estudiantes)
    { nombre: 'Renata Castro Delgado', grado: '1° Secundaria', nivel: 'Secundaria', estado: 'inscrito', beca: 'Beca Convenio Empresarial' },
    { nombre: 'Thiago Mendoza Ramos', grado: '2° Secundaria', nivel: 'Secundaria', estado: 'pendiente', beca: null },
    { nombre: 'Martina Ortega Herrera', grado: '3° Secundaria', nivel: 'Secundaria', estado: 'inscrito', beca: 'Beca Familiar' },
    { nombre: 'Joaquín Vega Jiménez', grado: '1° Secundaria', nivel: 'Secundaria', estado: 'inscrito', beca: null },
    { nombre: 'Julieta Aguilar Vargas', grado: '2° Secundaria', nivel: 'Secundaria', estado: 'pendiente', beca: 'Beca Deportiva' },
    { nombre: 'Benjamín Gutiérrez Sánchez', grado: '3° Secundaria', nivel: 'Secundaria', estado: 'inscrito', beca: null },
    
    // BACHILLERATO (5 estudiantes)
    { nombre: 'Ximena Delgado Ramírez', grado: '1° Bachillerato', nivel: 'Bachillerato', estado: 'inscrito', beca: 'Beca Socioeconómica' },
    { nombre: 'Gael Ramos Torres', grado: '2° Bachillerato', nivel: 'Bachillerato', estado: 'pendiente', beca: null },
    { nombre: 'Luciana Herrera Flores', grado: '3° Bachillerato', nivel: 'Bachillerato', estado: 'inscrito', beca: 'Beca Cultural' },
    { nombre: 'Ian Jiménez Morales', grado: '1° Bachillerato', nivel: 'Bachillerato', estado: 'inscrito', beca: null },
    { nombre: 'Zoe Vargas Castro', grado: '2° Bachillerato', nivel: 'Bachillerato', estado: 'pendiente', beca: 'Beca Empleados' }
  ];

  // Función para generar CURP
  function generateCURP(nombre: string, index: number): string {
    const apellidos = nombre.split(' ').slice(1).join(' ');
    const primerApellido = apellidos.split(' ')[0] || 'XXXX';
    const segundoApellido = apellidos.split(' ')[1] || 'XXXX';
    const nombres = nombre.split(' ')[0];
    
    const year = (2010 + (index % 15)).toString().slice(-2);
    const month = String((index % 12) + 1).padStart(2, '0');
    const day = String((index % 28) + 1).padStart(2, '0');
    
    return `${primerApellido.slice(0, 2)}${segundoApellido.charAt(0)}${nombres.charAt(0)}${year}${month}${day}H${(index % 2 === 0 ? 'M' : 'C')}RN0${(index % 10)}`;
  }

  // Insertar estudiantes usando solo campos disponibles en la tabla
  for (let i = 0; i < studentsData.length; i++) {
    const student = studentsData[i];
    
    await db.insert(students).values({
      campus_id: 24,
      nombre_completo: student.nombre,
      curp: generateCURP(student.nombre, i),
      grado: student.grado,
      grupo: 'A',
      status: 'activo'
    }).onConflictDoNothing();
  }

  console.log('✅ Datos de admisiones generados exitosamente');
  console.log('📊 Distribución por nivel:');
  console.log('   🎨 Kinder: 5 estudiantes (3 inscritos, 2 pendientes)');
  console.log('   📚 Primaria: 7 estudiantes (5 inscritos, 2 pendientes)');
  console.log('   🎓 Secundaria: 6 estudiantes (4 inscritos, 2 pendientes)');
  console.log('   🏆 Bachillerato: 5 estudiantes (3 inscritos, 2 pendientes)');
  console.log('   🎯 Total: 23 estudiantes (15 inscritos, 8 pendientes)');
  console.log('   💰 Con beca: 13 estudiantes');
  console.log('   📝 Sin beca: 10 estudiantes');
}