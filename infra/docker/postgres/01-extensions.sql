-- Runs once on first container start, against POSTGRES_DB.
-- postgis backs proximity search; pg_trgm is for provider name search.
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
