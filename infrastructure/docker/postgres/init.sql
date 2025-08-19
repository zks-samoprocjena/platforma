-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create initial schema
CREATE SCHEMA IF NOT EXISTS assessment;

-- Grant permissions
GRANT ALL ON SCHEMA assessment TO postgres;

-- Create Keycloak user if not exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_user WHERE usename = 'keycloak') THEN
        CREATE USER keycloak WITH PASSWORD 'keycloak';
    END IF;
END
$$;

-- Create Keycloak database if not exists and grant permissions
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_database WHERE datname = 'keycloak_db') THEN
        CREATE DATABASE keycloak_db OWNER keycloak;
    END IF;
END
$$;

-- Grant permissions
GRANT ALL PRIVILEGES ON DATABASE keycloak_db TO keycloak;

-- Connect to keycloak_db and set permissions
\c keycloak_db
GRANT ALL ON SCHEMA public TO keycloak;