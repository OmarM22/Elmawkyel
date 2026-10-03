/*
 * Prisma Client singleton (real-database mode only, Prisma 7 + pg adapter).
 * Demo mode (USE_DEMO_DATA=true) never touches this — see src/server/demo.ts.
 *
 * Setup for production:
 *   1. Set a real DATABASE_URL and USE_DEMO_DATA=false
 *   2. npx prisma migrate deploy
 *   3. npx prisma db seed
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
