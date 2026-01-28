-- USEA eSign Database Schema
-- Migration: 003_package_admin
-- Adds package admin designation to signing roles

-- Add is_package_admin column to signing_roles
-- The package admin is the designated decision-maker who can:
-- - Replace signers who refuse to sign
-- - Receive notifications about signature status updates
-- - Make changes to the package
ALTER TABLE signing_roles ADD COLUMN is_package_admin BOOLEAN DEFAULT FALSE;

-- Add index for quick lookup of package admins
CREATE INDEX IF NOT EXISTS idx_package_admin ON signing_roles (package_id, is_package_admin);
