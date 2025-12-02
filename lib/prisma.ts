import { PrismaClient } from "@prisma/client";

declare global {
  // Prevent multiple instances of PrismaClient in dev mode
  var prisma: PrismaClient | undefined;
}

// Force connection pooling URL for production (Vercel)
const getDatabaseUrl = () => {
  const url = process.env.DATABASE_URL;
  
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  
  // If in production and using Supabase, ensure we use connection pooling
  if (process.env.NODE_ENV === "production" && url.includes("supabase.co")) {
    // Replace port 5432 with 6543 and add pgbouncer parameters
    return url
      .replace(":5432/", ":6543/")
      .replace(/\?.*$/, "") // Remove existing query params
      + "?pgbouncer=true&connection_limit=1&pool_timeout=0&sslmode=require";
  }
  
  // For local development, add sslmode if not present
  if (!url.includes("sslmode=")) {
    return url + (url.includes("?") ? "&" : "?") + "sslmode=require";
  }
  
  return url;
};

export const prisma =
  global.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === "production" ? ["error"] : ["query", "error", "warn"],
    datasources: {
      db: {
        url: getDatabaseUrl(),
      },
    },
  });

if (process.env.NODE_ENV !== "production") global.prisma = prisma;
