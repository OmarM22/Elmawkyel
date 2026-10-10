-- Only the ADMIN role remains.
-- ALTER TYPE ... DROP VALUE cannot run inside Prisma's migration transaction on
-- this server, so the enum is recreated around the dependent column instead.

-- 1) Detach the old default (references the old enum value VIEWER)
ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;

-- 2) Widen to text so the enum can be dropped freely
ALTER TABLE "User" ALTER COLUMN "role" TYPE text USING "role"::text;

-- 3) Swap the enum for a single-value one
DROP TYPE "Role";
CREATE TYPE "Role" AS ENUM ('ADMIN');

-- 4) Cast the column back to the new enum
ALTER TABLE "User" ALTER COLUMN "role" TYPE "Role" USING "role"::"Role";

-- 5) New users default to ADMIN
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'ADMIN';