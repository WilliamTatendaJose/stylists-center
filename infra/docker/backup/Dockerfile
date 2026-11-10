# Nightly Postgres backup to a private S3-compatible bucket (Cloudflare R2).
# Deployed on Railway as its own service with a Cron Schedule, so it starts,
# dumps over the private network, uploads, and exits — billed only while it
# runs. See RAILWAY.md → "5. backup".
#
# The client major version must match the server's (postgis/postgis:16-3.4),
# or pg_dump refuses to run against it.
FROM postgres:16-alpine
RUN apk add --no-cache aws-cli
COPY backup.sh /usr/local/bin/backup.sh
RUN chmod +x /usr/local/bin/backup.sh
ENTRYPOINT ["/usr/local/bin/backup.sh"]
