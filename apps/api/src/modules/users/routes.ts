import { Router } from "express";
import oracledb from "oracledb";
import { query } from "../../lib/db";
import { env } from "../../config/env";
import { requireAdminOrInternalToken } from "../../middleware/auth";

export const userRouter = Router();

interface SyncStats {
  bks: number;
  yjs: number;
  jzg: number;
}

async function getOracleConnection(): Promise<oracledb.Connection> {
  return oracledb.getConnection({
    user: env.oracleUser,
    password: env.oraclePassword,
    connectString: env.oracleConnectString,
  });
}

async function upsertUser(
  userType: string,
  xh: string,
  row: Record<string, any>
): Promise<void> {
  await query(
    `INSERT INTO users (xh, user_type, xm, xb, csrq, sjh, xydm, xymc, zydm, zymc, xszt, nj, xslx, synced_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
     ON CONFLICT (xh) DO UPDATE SET
       user_type = EXCLUDED.user_type,
       xm = EXCLUDED.xm,
       xb = EXCLUDED.xb,
       csrq = EXCLUDED.csrq,
       sjh = EXCLUDED.sjh,
       xydm = EXCLUDED.xydm,
       xymc = EXCLUDED.xymc,
       zydm = EXCLUDED.zydm,
       zymc = EXCLUDED.zymc,
       xszt = EXCLUDED.xszt,
       nj = EXCLUDED.nj,
       xslx = EXCLUDED.xslx,
       synced_at = NOW()`,
    [
      xh,
      userType,
      row.XM,
      row.XB,
      row.CSRQ ?? null,
      row.SJH ?? null,
      row.XYDM ?? row.DWDM ?? null,
      row.XYMC ?? row.DWMC ?? null,
      row.ZYDM ?? null,
      row.ZYMC ?? null,
      row.XSZT ?? row.JSZT ?? null,
      row.NJ ?? null,
      row.XSLX ?? null,
    ]
  );
}

export async function syncOracleUsers(): Promise<SyncStats> {
  const conn = await getOracleConnection();
  try {
    const bksResult = await conn.execute(
      `SELECT XH, XM, XB, XSLX, NJ, XYDM, XYMC, ZYDM, ZYMC, XSZT, SJH, CSRQ
       FROM USR_DATA.VIEW_QYWX_BKS WHERE XSZT != '不在校'`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    const bksRows = (bksResult.rows ?? []) as Record<string, any>[];
    for (const r of bksRows) {
      await upsertUser("bks", r.XH, r);
    }

    const yjsResult = await conn.execute(
      `SELECT XH, XM, XB, XSLX, NJ, XYDM, XYMC, ZYDM, ZYMC, XSZT, SJH, CSRQ
       FROM USR_DATA.VIEW_QYWX_YJS WHERE XSZT != '不在校'`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    const yjsRows = (yjsResult.rows ?? []) as Record<string, any>[];
    for (const r of yjsRows) {
      await upsertUser("yjs", r.XH, r);
    }

    const jzgResult = await conn.execute(
      `SELECT ZGH, XM, XB, DWDM, DWMC, JSZT, SJH, CSRQ
       FROM USR_DATA.VIEW_QYWX_JZG WHERE JSZT = '在岗'`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    const jzgRows = (jzgResult.rows ?? []) as Record<string, any>[];
    for (const r of jzgRows) {
      await upsertUser("jzg", r.ZGH, r);
    }

    return { bks: bksRows.length, yjs: yjsRows.length, jzg: jzgRows.length };
  } finally {
    await conn.close();
  }
}

userRouter.get("/sync", requireAdminOrInternalToken, async (_req, res) => {
  try {
    const stats = await syncOracleUsers();
    res.json({ message: "同步完成", ...stats });
  } catch (error: any) {
    res.status(500).json({ message: "同步失败", detail: error.message });
  }
});
