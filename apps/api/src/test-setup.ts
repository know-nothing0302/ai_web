import dotenv from "dotenv";

// Load env before tests run — mirrors the same path resolution as config/env.ts
dotenv.config({ path: [__dirname, "..", ".env"].join("/") });
