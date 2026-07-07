-- Migration: Create missing tables required by CRM and migration module endpoints
-- These tables are referenced by existing API routes but were not present in the initial schema.

CREATE TABLE IF NOT EXISTS crm_prospects (
  id          SERIAL PRIMARY KEY,
  campus_id   INTEGER NOT NULL,
  nombre      VARCHAR(200) NOT NULL,
  email       VARCHAR(200),
  telefono    VARCHAR(30),
  nivel_interes VARCHAR(20) DEFAULT 'medio',
  nivel_escolar VARCHAR(50),
  notas       TEXT,
  status      VARCHAR(30) DEFAULT 'interested',
  created_at  TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS migration_projects (
  id          SERIAL PRIMARY KEY,
  campus_id   INTEGER NOT NULL,
  nombre      VARCHAR(200) NOT NULL,
  estado      VARCHAR(30) DEFAULT 'pendiente',
  tipo        VARCHAR(50),
  created_at  TIMESTAMP DEFAULT NOW()
);
