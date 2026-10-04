// Dedicated deterministic secrets for isolated tests only. Never use these in deployments.
process.env.AUTH_SECRET = "test-auth-secret-0123456789-0123456789-0123456789";
process.env.ENCRYPTION_SECRET = "test-encryption-secret-0123456789-0123456789";
process.env.LEGACY_ENCRYPTION_SECRET =
  "test-legacy-encryption-secret-0123456789";
process.env.CRON_SECRET = "test-cron-secret-0123456789-0123456789";
