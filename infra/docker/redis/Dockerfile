# Railway's Redis template doesn't expose a way to set --maxmemory-policy.
# noeviction is deliberate (see docker-compose.yml's redis service): BullMQ's
# delayed jobs are the authority for match-offer expiry, so an evicted key
# under memory pressure means a match request that never expires — losing
# keys is not an acceptable degradation here. Deploy this as its own "Deploy
# from Dockerfile" service instead of the plugin.
FROM redis:7-alpine
CMD ["redis-server", "--appendonly", "yes", "--maxmemory-policy", "noeviction"]
