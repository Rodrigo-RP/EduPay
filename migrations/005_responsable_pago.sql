-- ============================================================
-- MIGRACIÓN 005: Responsable de pago por alumno
-- Caso de uso: padres divorciados donde solo uno paga.
-- Un alumno puede tener N tutores pero solo el/los marcados
-- con es_responsable_pago = true reciben cargos y notificaciones.
-- ============================================================

ALTER TABLE student_guardian
  ADD COLUMN IF NOT EXISTS es_responsable_pago BOOLEAN NOT NULL DEFAULT true;

-- Índice parcial: solo las filas que son responsables (caso más consultado)
CREATE INDEX IF NOT EXISTS idx_sg_responsable
  ON student_guardian(student_id) WHERE es_responsable_pago = true;

-- Todos los tutores existentes quedan como responsables (backward compatible)
-- Para cambiar: UPDATE student_guardian SET es_responsable_pago = false
--               WHERE student_id = X AND guardian_id = Y;
