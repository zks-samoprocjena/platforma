-- Database Initialization Script
-- Run this to set up a fresh database

-- Create database (run as superuser)
-- CREATE DATABASE assessment_db OWNER assessment_user;

-- Connect to the database
\c assessment_db;

-- Load the schema
\i schema.sql;

-- Create default roles and permissions (example)
-- These should be managed by your authentication system (e.g., Keycloak)

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_assessments_organization_id ON assessments(organization_id);
CREATE INDEX IF NOT EXISTS idx_assessments_status ON assessments(status);
CREATE INDEX IF NOT EXISTS idx_controls_security_level ON controls(security_level_osnovna, security_level_srednja, security_level_napredna);
CREATE INDEX IF NOT EXISTS idx_answers_assessment_id ON assessment_answers(assessment_id);
CREATE INDEX IF NOT EXISTS idx_answers_control_id ON assessment_answers(control_id);

-- Vector search indexes (for RAG functionality)
-- CREATE INDEX IF NOT EXISTS idx_embeddings_vector ON document_embeddings USING ivfflat (embedding vector_cosine_ops);

COMMIT;
