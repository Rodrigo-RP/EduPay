/**
 * APIs del lado servidor para la migración desde Replit hacia Refeerence
 * Endpoints para que Refeerence pueda extraer y migrar el proyecto EDUPAY
 */

import { Router } from 'express';
import { ReplitMigrationService, refeerenceMigrationUtils, MigrationConfig } from '../shared/refeerence-migration';

const router = Router();

// Store para manejar progreso de migraciones activas
const migrationSessions = new Map<string, any>();

/**
 * Validar token de Replit
 * POST /api/migration/validate-token
 */
router.post('/validate-token', async (req, res) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({
        error: 'Token requerido',
        message: 'Debes proporcionar un token de Replit'
      });
    }

    const isValid = await refeerenceMigrationUtils.validateReplitToken(token);
    
    if (isValid) {
      res.json({
        valid: true,
        message: 'Token de Replit válido'
      });
    } else {
      res.status(401).json({
        valid: false,
        error: 'Token inválido',
        message: 'El token de Replit no es válido o ha expirado'
      });
    }
  } catch (error) {
    console.error('Error validating Replit token:', error);
    res.status(500).json({
      error: 'Error del servidor',
      message: 'No se pudo validar el token'
    });
  }
});

/**
 * Obtener proyectos del usuario en Replit
 * GET /api/migration/projects
 */
router.get('/projects', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        error: 'Token requerido',
        message: 'Debes proporcionar un token de autorización'
      });
    }

    const projects = await refeerenceMigrationUtils.getUserProjects(token);
    
    res.json({
      projects: projects.map(project => ({
        id: project.id,
        title: project.title,
        description: project.description,
        language: project.language,
        url: project.url,
        lastUpdated: project.timeUpdated,
        isEdupay: project.title.toLowerCase().includes('edupay') || 
                  project.description?.toLowerCase().includes('edupay')
      })),
      total: projects.length
    });
  } catch (error) {
    console.error('Error getting projects:', error);
    res.status(500).json({
      error: 'Error del servidor',
      message: 'No se pudieron obtener los proyectos'
    });
  }
});

/**
 * Obtener información detallada de un proyecto específico
 * GET /api/migration/project/:projectId
 */
router.get('/project/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        error: 'Token requerido'
      });
    }

    const config = refeerenceMigrationUtils.getDefaultMigrationConfig(projectId, token);
    const migrationService = new ReplitMigrationService(config);
    
    const projectData = await migrationService.getProjectInfo();
    
    if (projectData) {
      res.json({
        project: {
          id: projectData.id,
          title: projectData.title,
          description: projectData.description,
          language: projectData.language,
          url: projectData.url,
          owner: projectData.owner,
          filesCount: (projectData as any).files?.length ?? 0,
          dependenciesCount: Object.keys((projectData as any).dependencies ?? {}).length,
          secretsCount: (projectData as any).secrets?.length ?? 0,
          createdAt: projectData.createdAt,
          updatedAt: projectData.updatedAt
        }
      });
    } else {
      res.status(404).json({
        error: 'Proyecto no encontrado',
        message: 'No se pudo obtener la información del proyecto'
      });
    }
  } catch (error) {
    console.error('Error getting project info:', error);
    res.status(500).json({
      error: 'Error del servidor',
      message: 'No se pudo obtener la información del proyecto'
    });
  }
});

/**
 * Iniciar migración de un proyecto
 * POST /api/migration/start
 */
router.post('/start', async (req, res) => {
  try {
    const { projectId, config } = req.body;
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token || !projectId) {
      return res.status(400).json({
        error: 'Datos requeridos',
        message: 'Debes proporcionar token y projectId'
      });
    }

    // Generar ID único para esta sesión de migración
    const sessionId = `migration_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Configuración de migración
    const migrationConfig: MigrationConfig = {
      replitProjectId: projectId,
      replitToken: token,
      targetPlatform: 'refeerence',
      includeSecrets: config?.includeSecrets ?? true,
      includeDependencies: config?.includeDependencies ?? true,
      includeDatabase: config?.includeDatabase ?? true,
      preserveStructure: config?.preserveStructure ?? true
    };

    // Crear servicio de migración
    const migrationService = new ReplitMigrationService(migrationConfig);
    
    // Configurar reporte de progreso
    const progressHistory: any[] = [];
    migrationService.onProgress((progress) => {
      progressHistory.push({
        ...progress,
        timestamp: new Date().toISOString()
      });
      
      // Actualizar sesión
      migrationSessions.set(sessionId, {
        sessionId,
        status: progress.status,
        currentStep: progress.step,
        progress: progress.progress,
        history: progressHistory,
        startedAt: migrationSessions.get(sessionId)?.startedAt || new Date().toISOString()
      });
    });

    // Inicializar sesión
    migrationSessions.set(sessionId, {
      sessionId,
      status: 'pending',
      currentStep: 'initialization',
      progress: 0,
      history: [],
      startedAt: new Date().toISOString()
    });

    // Ejecutar migración de forma asíncrona
    migrationService.migrate()
      .then((result) => {
        migrationSessions.set(sessionId, {
          ...migrationSessions.get(sessionId),
          status: 'completed',
          result,
          completedAt: new Date().toISOString()
        });
      })
      .catch((error) => {
        migrationSessions.set(sessionId, {
          ...migrationSessions.get(sessionId),
          status: 'error',
          error: error.message,
          completedAt: new Date().toISOString()
        });
      });

    // Responder inmediatamente con el ID de sesión
    res.json({
      sessionId,
      message: 'Migración iniciada',
      status: 'pending'
    });
  } catch (error) {
    console.error('Error starting migration:', error);
    res.status(500).json({
      error: 'Error del servidor',
      message: 'No se pudo iniciar la migración'
    });
  }
});

/**
 * Obtener progreso de migración
 * GET /api/migration/progress/:sessionId
 */
router.get('/progress/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = migrationSessions.get(sessionId);
    
    if (!session) {
      return res.status(404).json({
        error: 'Sesión no encontrada',
        message: 'La sesión de migración no existe o ha expirado'
      });
    }

    res.json(session);
  } catch (error) {
    console.error('Error getting migration progress:', error);
    res.status(500).json({
      error: 'Error del servidor'
    });
  }
});

/**
 * Obtener resultado completo de migración
 * GET /api/migration/result/:sessionId
 */
router.get('/result/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = migrationSessions.get(sessionId);
    
    if (!session) {
      return res.status(404).json({
        error: 'Sesión no encontrada'
      });
    }

    if (session.status !== 'completed') {
      return res.status(400).json({
        error: 'Migración no completada',
        status: session.status,
        progress: session.progress
      });
    }

    res.json({
      sessionId,
      result: session.result,
      completedAt: session.completedAt,
      duration: new Date(session.completedAt).getTime() - new Date(session.startedAt).getTime()
    });
  } catch (error) {
    console.error('Error getting migration result:', error);
    res.status(500).json({
      error: 'Error del servidor'
    });
  }
});

/**
 * Descargar archivos del proyecto migrado
 * GET /api/migration/download/:sessionId
 */
router.get('/download/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = migrationSessions.get(sessionId);
    
    if (!session || session.status !== 'completed') {
      return res.status(404).json({
        error: 'Migración no disponible para descarga'
      });
    }

    const project = session.result.project;
    
    // Generar ZIP con todos los archivos
    const archiveData = {
      name: `${project.metadata.name}_migrated.zip`,
      files: project.files,
      metadata: project.metadata,
      configuration: project.configuration
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${archiveData.name}"`);
    res.json(archiveData);
  } catch (error) {
    console.error('Error downloading migration:', error);
    res.status(500).json({
      error: 'Error del servidor'
    });
  }
});

/**
 * Limpiar sesiones expiradas
 * DELETE /api/migration/cleanup
 */
router.delete('/cleanup', (req, res) => {
  try {
    const now = new Date().getTime();
    const maxAge = 24 * 60 * 60 * 1000; // 24 horas
    let cleaned = 0;

    for (const [sessionId, session] of Array.from(migrationSessions.entries())) {
      const sessionAge = now - new Date(session.startedAt).getTime();
      if (sessionAge > maxAge) {
        migrationSessions.delete(sessionId);
        cleaned++;
      }
    }

    res.json({
      message: `Se limpiaron ${cleaned} sesiones expiradas`,
      activeSessions: migrationSessions.size
    });
  } catch (error) {
    console.error('Error cleaning up sessions:', error);
    res.status(500).json({
      error: 'Error del servidor'
    });
  }
});

/**
 * Generar documentación de la API para Refeerence
 * GET /api/migration/docs
 */
router.get('/docs', (req, res) => {
  res.json({
    title: 'API de Migración EDUPAY desde Replit',
    description: 'Endpoints para que Refeerence pueda migrar proyectos desde Replit',
    version: '1.0.0',
    baseUrl: req.protocol + '://' + req.get('host') + '/api/migration',
    endpoints: {
      'POST /validate-token': {
        description: 'Validar token de Replit',
        body: { token: 'string' },
        response: { valid: 'boolean', message: 'string' }
      },
      'GET /projects': {
        description: 'Obtener lista de proyectos del usuario',
        headers: { Authorization: 'Bearer <token>' },
        response: { projects: 'array', total: 'number' }
      },
      'GET /project/:projectId': {
        description: 'Obtener información detallada de un proyecto',
        headers: { Authorization: 'Bearer <token>' },
        response: { project: 'object' }
      },
      'POST /start': {
        description: 'Iniciar migración de un proyecto',
        headers: { Authorization: 'Bearer <token>' },
        body: { projectId: 'string', config: 'object' },
        response: { sessionId: 'string', message: 'string', status: 'string' }
      },
      'GET /progress/:sessionId': {
        description: 'Obtener progreso de migración',
        response: { sessionId: 'string', status: 'string', progress: 'number', history: 'array' }
      },
      'GET /result/:sessionId': {
        description: 'Obtener resultado completo de migración',
        response: { sessionId: 'string', result: 'object', completedAt: 'string' }
      },
      'GET /download/:sessionId': {
        description: 'Descargar archivos del proyecto migrado',
        response: 'application/json (ZIP data)'
      }
    },
    examples: {
      'Flujo de migración completo': [
        '1. POST /validate-token - Validar token de Replit',
        '2. GET /projects - Obtener lista de proyectos',
        '3. GET /project/:id - Verificar proyecto EDUPAY',
        '4. POST /start - Iniciar migración',
        '5. GET /progress/:sessionId - Monitorear progreso',
        '6. GET /result/:sessionId - Obtener resultado',
        '7. GET /download/:sessionId - Descargar archivos'
      ]
    }
  });
});

export default router;