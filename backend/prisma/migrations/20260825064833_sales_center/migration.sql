/*
  Warnings:

  - Made the column `displayName` on table `User` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateTable
CREATE TABLE "CreditAccount" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'global',
    "balance" INTEGER NOT NULL DEFAULT 0,
    "creditsPerGB" INTEGER NOT NULL DEFAULT 2000,
    "package1M1U" INTEGER NOT NULL DEFAULT 0,
    "package1M2U" INTEGER NOT NULL DEFAULT 0,
    "package2M1U" INTEGER NOT NULL DEFAULT 0,
    "package2M2U" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "CreditTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "amount" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT,
    "userId" TEXT,
    "accountId" TEXT NOT NULL DEFAULT 'global',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CreditTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CreditTransaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "CreditAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "referrerId" TEXT,
    "note" TEXT,
    "subToken" TEXT NOT NULL,
    "dataLimitGB" REAL,
    "ipLimit" INTEGER,
    "expireAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "planType" TEXT,
    "packageCode" TEXT,
    "creditCost" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "User_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_User" ("createdAt", "dataLimitGB", "displayName", "expireAt", "id", "ipLimit", "note", "referrerId", "status", "subToken", "updatedAt", "username") SELECT "createdAt", "dataLimitGB", COALESCE("displayName", "username"), "expireAt", "id", "ipLimit", "note", "referrerId", "status", "subToken", "updatedAt", "username" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
CREATE UNIQUE INDEX "User_subToken_key" ON "User"("subToken");
CREATE INDEX "User_referrerId_idx" ON "User"("referrerId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "CreditTransaction_createdAt_idx" ON "CreditTransaction"("createdAt");

-- CreateIndex
CREATE INDEX "CreditTransaction_userId_idx" ON "CreditTransaction"("userId");
