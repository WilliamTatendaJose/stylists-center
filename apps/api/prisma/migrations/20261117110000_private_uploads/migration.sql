-- CreateTable
CREATE TABLE "Upload" (
    "name" TEXT NOT NULL,
    "ownerId" TEXT,
    "private" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Upload_pkey" PRIMARY KEY ("name")
);

-- CreateIndex
CREATE INDEX "Upload_ownerId_idx" ON "Upload"("ownerId");

-- Backfill: chat attachments that already exist become private.
INSERT INTO "Upload" ("name", "ownerId", "private")
SELECT DISTINCT ON (substr(a."url", 10)) substr(a."url", 10), m."authorId", true
FROM "MessageAttachment" a
JOIN "Message" m ON m."id" = a."messageId"
WHERE a."url" ~ '^/uploads/[a-f0-9-]{36}\.[A-Za-z]+$'
ON CONFLICT ("name") DO UPDATE SET "private" = true;

-- Backfill: identity documents and selfies still on file. Skips any name that
-- is also someone's public profile photo, so a document URL that happens to be
-- shared with a public image never hides that image.
INSERT INTO "Upload" ("name", "ownerId", "private")
SELECT DISTINCT ON (doc."name") doc."name", doc."ownerId", true
FROM (
    SELECT substr(u."verificationIdDocumentUrl", 10) AS "name", u."id" AS "ownerId"
    FROM "User" u
    WHERE u."verificationIdDocumentUrl" ~ '^/uploads/[a-f0-9-]{36}\.[A-Za-z]+$'
    UNION ALL
    SELECT substr(u."verificationSelfieImageUrl", 10), u."id"
    FROM "User" u
    WHERE u."verificationSelfieImageUrl" ~ '^/uploads/[a-f0-9-]{36}\.[A-Za-z]+$'
) doc
WHERE NOT EXISTS (
    SELECT 1 FROM "User" pu WHERE pu."avatarImageUrl" = '/uploads/' || doc."name"
)
AND NOT EXISTS (
    SELECT 1 FROM "ProviderProfile" pp WHERE pp."profileImageUrl" = '/uploads/' || doc."name"
)
ON CONFLICT ("name") DO UPDATE SET "private" = true;
