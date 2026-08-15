# Railway's one-click Postgres plugin does not include PostGIS — the geo
# module's proximity search (ST_DWithin/ST_Distance over a `geography`
# column, see apps/api/src/modules/geo/geo.repository.ts) hard-depends on it.
# Deploy this image as its own "Deploy from Dockerfile" service instead of
# using the plugin. Mirrors docker-compose.yml's db service exactly, minus
# the sc_test database (dev/CI only).
FROM postgis/postgis:16-3.4
COPY 01-extensions.sql /docker-entrypoint-initdb.d/01-extensions.sql
