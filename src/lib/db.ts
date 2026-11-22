import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

// Reuse one client per server instance (dev hot reload AND warm Vercel functions), so each instance
// keeps a single small pool instead of opening new database connections.
// On Vercel, DATABASE_URL must be Neon's POOLED url (host contains "-pooler") with &connection_limit=5.
globalForPrisma.prisma = prisma;

export function newId(): string {
  return crypto.randomUUID();
}

export function now(): Date {
  return new Date();
}
