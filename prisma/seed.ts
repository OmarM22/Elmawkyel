/*
 * Seed: create the FIRST administrator (production database).
 * Runs via: INITIAL_ADMIN_EMAIL=... INITIAL_ADMIN_PASSWORD=... npx prisma db seed
 *
 * - Creates the admin ONLY if no ADMIN user exists yet (safe to re-run).
 * - Password is hashed with scrypt (node:crypto, no extra dependencies).
 * - Never hardcode real credentials: they must come from environment/secrets.
 * - Erasable TypeScript only (runs with plain `node`, no tsx needed).
 */
import { randomBytes, scrypt as scryptCb } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

function scryptBuf(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password, salt, 64, { N: 16384, r: 8, p: 1 }, (err, derived) => {
      if (err) reject(err);
      else resolve(derived as Buffer);
    });
  });
}

async function hashPassword(password: string): Promise<string> {
  if (!password || password.length < 8) throw new Error("Password must be at least 8 characters");
  const salt = randomBytes(16).toString("hex");
  const hash = await scryptBuf(password, salt);
  return `scrypt$16384$8$1$${salt}$${hash.toString("hex")}`;
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    // Sample people/projects are demo-only. A real client database must stay
    // empty so they can add their own — set SEED_SAMPLE_DATA=true to opt in.
    if (process.env.SEED_SAMPLE_DATA === "true") {
      await seedReferenceData(prisma);
    }
    const existing = await prisma.user.findFirst({ where: { role: "ADMIN" } });
    if (existing) {
      console.log("Admin already exists — nothing to do.");
      return;
    }
    const email = process.env.INITIAL_ADMIN_EMAIL;
    const password = process.env.INITIAL_ADMIN_PASSWORD;
    if (!email || !password) {
      console.log("Set INITIAL_ADMIN_EMAIL and INITIAL_ADMIN_PASSWORD to create the first admin.");
      return;
    }
    const username = email.split("@")[0] ?? "admin";
    await prisma.user.create({
      data: {
        username,
        email,
        name: "مدير النظام",
        passwordHash: await hashPassword(password),
        role: "ADMIN",
        active: true,
      },
    });
    console.log(`First admin created: ${email}`);
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Reference dataset (mirrors the demo store) so a fresh production DB
 * is usable immediately. Runs only when the tables are empty.
 */
async function seedReferenceData(prisma: PrismaClient): Promise<void> {
    if ((await prisma.person.count()) === 0) {
      await prisma.person.createMany({
        data: [
          { name: "أحمد حسن", type: "CRAFTSMAN", phone: "0551234567", active: true, currentDailyRate: "200.00" },
          { name: "محمد علي", type: "WORKER", phone: "0562345678", active: true, currentDailyRate: "150.00" },
          { name: "كريم صلاح", type: "CRAFTSMAN", phone: null, active: true, currentDailyRate: "200.00" },
          { name: "أحمد محمد", type: "WORKER", phone: "0573456789", active: true, currentDailyRate: "150.00" },
        ],
      });
      console.log("Seeded 4 people.");
    }
    if ((await prisma.project.count()) === 0) {
      await prisma.project.createMany({
        data: [
          {
            name: "مشروع كمبوند الأوركيد",
            startDate: new Date("2026-09-01T00:00:00.000Z"),
            endDate: new Date("2026-12-31T00:00:00.000Z"),
            status: "ACTIVE",
            workingDays: ["SATURDAY", "SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY"],
          },
          {
            name: "مشروع فيلا النخيل",
            startDate: new Date("2026-08-15T00:00:00.000Z"),
            endDate: new Date("2026-11-15T00:00:00.000Z"),
            status: "ACTIVE",
            workingDays: ["SATURDAY", "SUNDAY", "MONDAY"],
          },
          {
            name: "مشروع مبنى سنترو",
            startDate: new Date("2026-07-01T00:00:00.000Z"),
            endDate: new Date("2026-10-01T00:00:00.000Z"),
            status: "COMPLETED",
            workingDays: ["SATURDAY", "SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY"],
          },
        ],
      });
      console.log("Seeded 3 projects.");
    }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
