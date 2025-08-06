import { db } from './db';
import { students, guardians, student_guardian, concepts } from '@shared/schema';
import { eq } from 'drizzle-orm';
import * as XLSX from 'xlsx';

interface RealStudentData {
  curp: string;
  nombre_completo: string;
  grado: string;
  grupo: string;
  nivel_educativo: 'primaria' | 'secundaria' | 'preparatoria';
  tutor_nombre: string;
  tutor_email: string;
  tutor_telefono: string;
  tutor_rfc?: string;
  direccion?: string;
  fecha_nacimiento?: string;
  status: 'activo' | 'baja' | 'suspendido';
}

interface RealGuardianData {
  email: string;
  nombre_completo: string;
  telefono: string;
  rfc?: string;
  direccion?: string;
  tipo_tutor: 'padre' | 'madre' | 'tutor_legal' | 'abuelo' | 'familiar';
}

export class RealDataImporter {
  private campusId: number;

  constructor(campusId: number) {
    this.campusId = campusId;
  }

  // Importar alumnos desde Excel/CSV real
  async importStudentsFromExcel(filePath: string): Promise<{ success: boolean; imported: number; errors: string[] }> {
    try {
      console.log('📊 Importando alumnos desde archivo real...');
      
      const workbook = XLSX.readFile(filePath);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawData = XLSX.utils.sheet_to_json(worksheet);
      
      const errors: string[] = [];
      let imported = 0;
      
      for (const row of rawData) {
        try {
          const studentData = this.parseStudentRow(row);
          const guardianData = this.parseGuardianFromRow(row);
          
          // Crear o encontrar tutor
          let guardian = await this.findOrCreateGuardian(guardianData);
          
          // Crear estudiante
          const [student] = await db.insert(students).values({
            campus_id: this.campusId,
            curp: studentData.curp,
            nombre_completo: studentData.nombre_completo,
            grado: studentData.grado,
            grupo: studentData.grupo,
            status: studentData.status
          }).returning();
          
          // Relacionar estudiante con tutor
          await db.insert(student_guardian).values({
            student_id: student.id,
            guardian_id: guardian.id,
            porcentaje_responsabilidad: "100.00"
          });
          
          imported++;
          
        } catch (error) {
          errors.push(`Error en fila ${imported + 1}: ${error instanceof Error ? error.message : 'Error desconocido'}`);
        }
      }
      
      console.log(`✅ Importación completada: ${imported} alumnos importados`);
      if (errors.length > 0) {
        console.log(`⚠️  ${errors.length} errores encontrados`);
      }
      
      return { success: true, imported, errors };
      
    } catch (error) {
      console.error('❌ Error importando alumnos:', error);
      return { 
        success: false, 
        imported: 0, 
        errors: [error instanceof Error ? error.message : 'Error desconocido'] 
      };
    }
  }

  // Configurar conceptos de pago reales del Instituto JFR
  async setupRealPaymentConcepts(): Promise<void> {
    try {
      console.log('💰 Configurando conceptos de pago reales...');
      
      const conceptsData = [
        {
          nombre: 'Colegiatura Mensual - Primaria',
          tipo: 'colegiatura',
          periodicidad: 'mensual',
          monto_centavos: 450000, // $4,500.00
          iva: false,
          nivel_educativo: 'primaria'
        },
        {
          nombre: 'Colegiatura Mensual - Secundaria',
          tipo: 'colegiatura',
          periodicidad: 'mensual',
          monto_centavos: 520000, // $5,200.00
          iva: false,
          nivel_educativo: 'secundaria'
        },
        {
          nombre: 'Colegiatura Mensual - Preparatoria',
          tipo: 'colegiatura',
          periodicidad: 'mensual',
          monto_centavos: 680000, // $6,800.00
          iva: false,
          nivel_educativo: 'preparatoria'
        },
        {
          nombre: 'Inscripción Anual - Primaria',
          tipo: 'inscripcion',
          periodicidad: 'anual',
          monto_centavos: 1200000, // $12,000.00
          iva: false,
          nivel_educativo: 'primaria'
        },
        {
          nombre: 'Inscripción Anual - Secundaria',
          tipo: 'inscripcion',
          periodicidad: 'anual',
          monto_centavos: 1500000, // $15,000.00
          iva: false,
          nivel_educativo: 'secundaria'
        },
        {
          nombre: 'Inscripción Anual - Preparatoria',
          tipo: 'inscripcion',
          periodicidad: 'anual',
          monto_centavos: 2000000, // $20,000.00
          iva: false,
          nivel_educativo: 'preparatoria'
        },
        {
          nombre: 'Seguro Escolar',
          tipo: 'extra',
          periodicidad: 'anual',
          monto_centavos: 80000, // $800.00
          iva: true
        },
        {
          nombre: 'Uniforme Escolar',
          tipo: 'extra',
          periodicidad: 'eventual',
          monto_centavos: 150000, // $1,500.00
          iva: true
        },
        {
          nombre: 'Actividades Extraescolares',
          tipo: 'extra',
          periodicidad: 'mensual',
          monto_centavos: 80000, // $800.00
          iva: false
        },
        {
          nombre: 'Examen de Admisión',
          tipo: 'extra',
          periodicidad: 'eventual',
          monto_centavos: 50000, // $500.00
          iva: false
        }
      ];
      
      for (const conceptData of conceptsData) {
        await db.insert(concepts).values({
          campus_id: this.campusId,
          ...conceptData
        });
      }
      
      console.log(`✅ ${conceptsData.length} conceptos de pago configurados`);
      
    } catch (error) {
      console.error('❌ Error configurando conceptos de pago:', error);
    }
  }

  private parseStudentRow(row: any): RealStudentData {
    return {
      curp: row['CURP'] || row['curp'] || '',
      nombre_completo: row['Nombre Completo'] || row['nombre'] || '',
      grado: row['Grado'] || row['grado'] || '',
      grupo: row['Grupo'] || row['grupo'] || '',
      nivel_educativo: this.determineEducationLevel(row['Grado'] || row['grado'] || ''),
      tutor_nombre: row['Tutor'] || row['tutor_nombre'] || '',
      tutor_email: row['Email Tutor'] || row['tutor_email'] || '',
      tutor_telefono: row['Teléfono'] || row['telefono'] || '',
      tutor_rfc: row['RFC Tutor'] || row['rfc'] || '',
      status: 'activo'
    };
  }

  private parseGuardianFromRow(row: any): RealGuardianData {
    return {
      email: row['Email Tutor'] || row['tutor_email'] || '',
      nombre_completo: row['Tutor'] || row['tutor_nombre'] || '',
      telefono: row['Teléfono'] || row['telefono'] || '',
      rfc: row['RFC Tutor'] || row['rfc'] || '',
      tipo_tutor: 'padre'
    };
  }

  private determineEducationLevel(grado: string): 'primaria' | 'secundaria' | 'preparatoria' {
    const gradoLower = grado.toLowerCase();
    if (gradoLower.includes('1°') || gradoLower.includes('2°') || gradoLower.includes('3°') || 
        gradoLower.includes('4°') || gradoLower.includes('5°') || gradoLower.includes('6°') ||
        gradoLower.includes('primero') || gradoLower.includes('segundo') || gradoLower.includes('tercero') ||
        gradoLower.includes('cuarto') || gradoLower.includes('quinto') || gradoLower.includes('sexto')) {
      return 'primaria';
    }
    if (gradoLower.includes('1° sec') || gradoLower.includes('2° sec') || gradoLower.includes('3° sec') ||
        gradoLower.includes('secundaria')) {
      return 'secundaria';
    }
    return 'preparatoria';
  }

  private async findOrCreateGuardian(guardianData: RealGuardianData) {
    // Buscar tutor existente por email
    const existing = await db.select()
      .from(guardians)
      .where(eq(guardians.email, guardianData.email))
      .limit(1);

    if (existing.length > 0) {
      return existing[0];
    }

    // Crear nuevo tutor
    const [guardian] = await db.insert(guardians).values({
      email: guardianData.email,
      nombre_completo: guardianData.nombre_completo,
      telefono: guardianData.telefono,
      rfc: guardianData.rfc || null
    }).returning();

    return guardian;
  }
}

// Función de configuración inicial para datos reales
export async function setupRealSystemData(campusId: number) {
  const importer = new RealDataImporter(campusId);
  
  console.log('🏗️  Configurando sistema con datos reales...');
  
  // Configurar conceptos de pago
  await importer.setupRealPaymentConcepts();
  
  console.log('✅ Sistema preparado para datos reales del Instituto JFR');
  console.log('📋 Listo para importar archivo de alumnos reales');
  
  return importer;
}