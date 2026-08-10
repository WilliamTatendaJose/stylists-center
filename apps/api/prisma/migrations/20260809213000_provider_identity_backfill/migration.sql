UPDATE "ProviderProfile" AS profile
SET "displayName" = account."displayName",
    "updatedAt" = CURRENT_TIMESTAMP
FROM "User" AS account
WHERE profile."userId" = account.id
  AND profile."displayName" IS DISTINCT FROM account."displayName";
