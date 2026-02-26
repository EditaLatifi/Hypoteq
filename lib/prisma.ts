import { PrismaClient } from "@prisma/client";

declare global {
  // Prevent multiple instances of PrismaClient in dev mode
  var prisma: PrismaClient | undefined;
}

// Create PrismaClient instance with proper configuration
const createPrismaClient = () => {
  // In production, use connection pooling if available
  const databaseUrl = process.env.NODE_ENV === "production" 
    ? (process.env.POSTGRES_PRISMA_URL || process.env.DATABASE_URL)
    : process.env.DATABASE_URL;

  return new PrismaClient({
    log: process.env.NODE_ENV === "production" ? ["error", "warn"] : ["query", "error", "warn"],
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });
};

let prisma: PrismaClient;
if (process.env.NODE_ENV === 'production') {
  prisma = createPrismaClient();
} else {
  if (!global.prisma) {
    global.prisma = createPrismaClient();
  }
  prisma = global.prisma;
}

export { prisma };

if (process.env.NODE_ENV !== "production") {
  global.prisma = prisma;
}
