-- Migración 009: foto_url users varchar(500) → text
--
-- Contexto: la columna almacena fotos de perfil como data URI base64.
-- varchar(500) es insuficiente incluso para thumbnails pequeños
-- (un PNG de 16×16 produce ~800 chars de base64 con prefijo data URI).
-- Se cambia a TEXT para almacenar imágenes de tamaño realista sin truncamiento.
--
-- Decisión provisional: TEXT resuelve el problema hoy sin infraestructura nueva.
-- Fase 2 (cuando se conecte PAC de CFDI): migrar a almacenamiento de objetos
-- y guardar solo la URL del objeto en esta columna.

ALTER TABLE users ALTER COLUMN foto_url TYPE TEXT;
