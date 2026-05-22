import { readFile } from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";
import { env } from "../config/env";

const isValidDbName = (name: string): boolean => /^[A-Za-z0-9_]+$/.test(name);

const buildConfig = (database: string) => ({
  host: env.postgresHost,
  port: env.postgresPort,
  user: env.postgresUser,
  password: env.postgresPassword,
  database,
  max: 2,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 5000,
});

const ensureDatabase = async (): Promise<void> => {
  if (!isValidDbName(env.postgresDb)) {
    throw new Error("POSTGRES_DB 仅支持字母、数字和下划线");
  }
  const adminPool = new Pool(buildConfig("postgres"));
  try {
    const existsResult = await adminPool.query<{ exists: boolean }>(
      "SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname = $1) AS exists",
      [env.postgresDb]
    );
    if (existsResult.rows[0]?.exists) {
      return;
    }
    await adminPool.query(`CREATE DATABASE "${env.postgresDb}"`);
  } finally {
    await adminPool.end();
  }
};

const resolveMigrationFile = (): string => {
  return path.resolve(process.cwd(), "sql/001_init.sql");
};

const migrate = async (): Promise<void> => {
  await ensureDatabase();
  const sql = await readFile(resolveMigrationFile(), "utf-8");
  const pool = new Pool(buildConfig(env.postgresDb));
  try {
    await pool.query(sql);
    process.stdout.write("数据库迁移完成\n");
  } finally {
    await pool.end();
  }
};

migrate().catch((error: Error) => {
  process.stderr.write(`数据库迁移失败: ${error.message}\n`);
  process.exit(1);
});
