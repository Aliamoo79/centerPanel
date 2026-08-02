-- Keep every existing user. Their current username becomes their visible name.
ALTER TABLE "User" ADD COLUMN "displayName" TEXT;
ALTER TABLE "User" ADD COLUMN "referrerId" TEXT REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
UPDATE "User" SET "displayName" = "username" WHERE "displayName" IS NULL;

-- SQLite cannot add a NOT NULL column without a constant default while preserving
-- existing data. Application validation guarantees displayName for all new rows.
CREATE INDEX "User_referrerId_idx" ON "User"("referrerId");
