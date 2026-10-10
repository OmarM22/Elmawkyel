-- AlterEnum: drop ABSENT from AttendanceStatus
BEGIN;
CREATE TYPE "AttendanceStatus_new" AS ENUM ('PRESENT', 'LEAVE');
ALTER TABLE "public"."DailyAttendance" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "DailyAttendance" ALTER COLUMN "status" TYPE "AttendanceStatus_new" USING ("status"::text::"AttendanceStatus_new");
ALTER TYPE "AttendanceStatus" RENAME TO "AttendanceStatus_old";
ALTER TYPE "AttendanceStatus_new" RENAME TO "AttendanceStatus";
DROP TYPE "public"."AttendanceStatus_old";
ALTER TABLE "DailyAttendance" ALTER COLUMN "status" SET DEFAULT 'PRESENT';
COMMIT;

-- AlterTable
ALTER TABLE "DailyAttendance" DROP COLUMN "autoCreated";
