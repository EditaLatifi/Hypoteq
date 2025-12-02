import { defineConfig } from "@prisma/config";

export default defineConfig({
  schema: "./prisma/schema.prisma",
  env: {
    DATABASE_URL: process.env.DATABASE_URL || "",
  },
});
