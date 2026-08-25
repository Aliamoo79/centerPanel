-- Add role-based dashboard access. Existing accounts remain administrators.
ALTER TABLE "Admin" ADD COLUMN "role" TEXT NOT NULL DEFAULT 'ADMIN';
