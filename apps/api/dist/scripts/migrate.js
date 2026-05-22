"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const promises_1 = require("node:fs/promises");
const node_path_1 = __importDefault(require("node:path"));
const pg_1 = require("pg");
const env_1 = require("../config/env");
const isValidDbName = (name) => /^[A-Za-z0-9_]+$/.test(name);
const buildConfig = (database) => ({
    host: env_1.env.postgresHost,
    port: env_1.env.postgresPort,
    user: env_1.env.postgresUser,
    password: env_1.env.postgresPassword,
    database,
    max: 2,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 5000,
});
const ensureDatabase = async () => {
    if (!isValidDbName(env_1.env.postgresDb)) {
        throw new Error("POSTGRES_DB 仅支持字母、数字和下划线");
    }
    const adminPool = new pg_1.Pool(buildConfig("postgres"));
    try {
        const existsResult = await adminPool.query("SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname = $1) AS exists", [env_1.env.postgresDb]);
        if (existsResult.rows[0]?.exists) {
            return;
        }
        await adminPool.query(`CREATE DATABASE "${env_1.env.postgresDb}"`);
    }
    finally {
        await adminPool.end();
    }
};
const resolveMigrationFile = () => {
    return node_path_1.default.resolve(process.cwd(), "sql/001_init.sql");
};
const migrate = async () => {
    await ensureDatabase();
    const sql = await (0, promises_1.readFile)(resolveMigrationFile(), "utf-8");
    const pool = new pg_1.Pool(buildConfig(env_1.env.postgresDb));
    try {
        await pool.query(sql);
        process.stdout.write("数据库迁移完成\n");
    }
    finally {
        await pool.end();
    }
};
migrate().catch((error) => {
    process.stderr.write(`数据库迁移失败: ${error.message}\n`);
    process.exit(1);
});
