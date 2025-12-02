import { PrismaClient } from "@prisma/client";

declare global {
  // Prevent multiple instances of PrismaClient in dev mode
  var prisma: PrismaClient | undefined;
}

// Create PrismaClient instance with proper configuration
const createPrismaClient = () => {
  return new PrismaClient({
    log: process.env.NODE_ENV === "production" ? ["error", "warn"] : ["query", "error", "warn"],
    datasources: {
      db: {
        url: process.env.POSTGRES_PRISMA_URL || process.env.DATABASE_URL,
      },
    },
  });
};

export const prisma = global.prisma || createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  global.prisma = prisma;
}
