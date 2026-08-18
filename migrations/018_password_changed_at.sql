-- Migración 018: password_changed_at
-- Permite invalidar sesiones JWT activas tras un cambio de contraseña.
-- El middleware compara iat del JWT contra este campo; si iat < password_changed_at
-- la sesión es rechazada aunque la firma sea válida y el token no haya expirado.
ALTER TABLE users     ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ;
ALTER TABLE guardians ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ;
