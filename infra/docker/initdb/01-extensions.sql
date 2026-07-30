-- Runs once on first container start, against the POSTGRES_DB (sc_dev).
-- postgis backs proximity search; pg_trgm is for provider name search later.
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- A separate test database so integration tests can truncate freely without
-- touching development data.
CREATE DATABASE sc_test OWNER sc;
\connect sc_test
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
