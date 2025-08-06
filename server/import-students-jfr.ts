import { db } from './db';
import { students, guardians, student_guardian } from '@shared/schema';
import { eq } from 'drizzle-orm';
import * as fs from 'fs';

interface StudentRecord {
  curp: string;
  nombre_completo: string;
  grado: string;
  grupo: string;
  tutor: string;
  email_tutor: string;
  telefono: string;
  rfc_tutor: string;
}

export async function importStudentsFromCSV(filePath: string, campusId: number) {
  try {
    console.log('📚 Importando alumnos del Instituto JFR...');
    
    const csvData = fs.readFileSync(filePath, 'utf8');
    const lines = csvData.split('\n');
    const headers = lines[0].split(',');
    
    let imported = 0;
    const errors: string[] = [];
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      try {
        const values = line.split(',');
        const record: StudentRecord = {
          curp: values[0]?.trim() || '',
          nombre_completo: values[1]?.trim() || '',
          grado: values[2]?.trim() || '',
          grupo: values[3]?.trim() || '',
          tutor: values[4]?.trim() || '',
          email_tutor: values[5]?.trim() || '',
          telefono: values[6]?.trim() || '',
          rfc_tutor: values[7]?.trim() || ''
        };
        
        if (!record.curp || !record.nombre_completo || !record.email_tutor) {
          errors.push(`Línea ${i + 1}: Faltan datos obligatorios`);
          continue;
        }
        
        // Crear o encontrar tutor
        let guardian = await db.select()
          .from(guardians)
          .where(eq(guardians.email, record.email_tutor))
          .limit(1);
        
        if (guardian.length === 0) {
          const [newGuardian] = await db.insert(guardians).values({
            email: record.email_tutor,
            nombre_completo: record.tutor,
            telefono: record.telefono,
            rfc: record.rfc_tutor || null
          }).returning();
          guardian = [newGuardian];
        }
        
        // Crear estudiante
        const [student] = await db.insert(students).values({
          campus_id: campusId,
          curp: record.curp,
          nombre_completo: record.nombre_completo,
          grado: record.grado,
          grupo: record.grupo,
          status: 'activo'
        }).returning();
        
        // Relacionar estudiante con tutor
        await db.insert(student_guardian).values({
          student_id: student.id,
          guardian_id: guardian[0].id,
          porcentaje_responsabilidad: "100.00"
        });
        
        imported++;
        console.log(`✅ Importado: ${record.nombre_completo} (${record.grado} ${record.grupo})`);
        
      } catch (error) {
        errors.push(`Línea ${i + 1}: ${error instanceof Error ? error.message : 'Error desconocido'}`);
      }
    }
    
    console.log(`\n🎉 IMPORTACIÓN COMPLETADA`);
    console.log(`📊 Alumnos importados: ${imported}`);
    if (errors.length > 0) {
      console.log(`⚠️ Errores encontrados: ${errors.length}`);
      errors.forEach(error => console.log(`  - ${error}`));
    }
    
    return { success: true, imported, errors };
    
  } catch (error) {
    console.error('❌ Error durante importación:', error);
    return { 
      success: false, 
      imported: 0, 
      errors: [error instanceof Error ? error.message : 'Error desconocido'] 
    };
  }
}

// Función ejecutable
async function main() {
  const campusId = 39; // Campus Principal - Instituto JFR
  const filePath = '../plantilla_alumnos_instituto_jfr.csv';
  
  console.log('🏫 IMPORTACIÓN DE ALUMNOS - INSTITUTO JFR');
  console.log('=' .repeat(50));
  
  const result = await importStudentsFromCSV(filePath, campusId);
  
  if (result.success) {
    console.log('\n✅ IMPORTACIÓN EXITOSA');
    console.log(`Total de alumnos: ${result.imported}`);
  } else {
    console.log('\n❌ ERROR EN IMPORTACIÓN');
    console.log('Errores:', result.errors);
  }
}

// Ejecutar directamente
main().catch(console.error);