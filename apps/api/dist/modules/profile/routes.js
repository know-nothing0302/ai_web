"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.profileRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const db_1 = require("../../lib/db");
const auth_1 = require("../../middleware/auth");
exports.profileRouter = (0, express_1.Router)();
exports.profileRouter.use(auth_1.requireAuth);
const pageSchema = zod_1.z.object({
    page: zod_1.z.coerce.number().int().min(1).default(1),
    pageSize: zod_1.z.coerce.number().int().min(1).max(50).default(20),
});
const favoriteBodySchema = zod_1.z.object({
    articleId: zod_1.z.string().uuid(),
});
const historyBodySchema = zod_1.z.object({
    articleId: zod_1.z.string().uuid(),
});
// 添加收藏
exports.profileRouter.post("/favorites", async (request, response) => {
    const parsed = favoriteBodySchema.safeParse(request.body);
    if (!parsed.success) {
        response.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
        return;
    }
    const userId = request.session.user.id;
    const { articleId } = parsed.data;
    try {
        const result = await (0, db_1.query)(`INSERT INTO user_favorites (user_id, article_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id, article_id) DO NOTHING
       RETURNING id, created_at`, [userId, articleId]);
        if (result.rows.length === 0) {
            response.status(200).json({ message: "已收藏" });
            return;
        }
        response.status(201).json({ id: result.rows[0].id, createdAt: result.rows[0].created_at });
    }
    catch (error) {
        response.status(500).json({ message: "收藏失败" });
    }
});
// 取消收藏
exports.profileRouter.delete("/favorites/:articleId", async (request, response) => {
    const userId = request.session.user.id;
    const articleId = request.params.articleId.toString();
    try {
        await (0, db_1.query)("DELETE FROM user_favorites WHERE user_id = $1 AND article_id = $2", [userId, articleId]);
        response.status(204).send();
    }
    catch (error) {
        response.status(500).json({ message: "取消收藏失败" });
    }
});
// 检查某篇文章是否已收藏
exports.profileRouter.get("/favorites/check/:articleId", async (request, response) => {
    const userId = request.session.user.id;
    const articleId = request.params.articleId.toString();
    const result = await (0, db_1.query)("SELECT id, created_at FROM user_favorites WHERE user_id = $1 AND article_id = $2 LIMIT 1", [userId, articleId]);
    if (result.rows.length === 0) {
        response.json({ isFavorited: false });
        return;
    }
    response.json({ isFavorited: true, id: result.rows[0].id, createdAt: result.rows[0].created_at });
});
// 我的收藏列表（分页，联表 articles）
exports.profileRouter.get("/favorites", async (request, response) => {
    const parsed = pageSchema.safeParse(request.query);
    if (!parsed.success) {
        response.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
        return;
    }
    const userId = request.session.user.id;
    const { page, pageSize } = parsed.data;
    const offset = (page - 1) * pageSize;
    const countResult = await (0, db_1.query)(`SELECT COUNT(*)::text as count FROM user_favorites WHERE user_id = $1`, [userId]);
    const total = parseInt(countResult.rows[0]?.count ?? "0", 10);
    const itemsResult = await (0, db_1.query)(`SELECT f.id, f.article_id, a.title, a.summary, a.channel_code, a.category, a.published_at, f.created_at
     FROM user_favorites f
     JOIN articles a ON a.id = f.article_id
     WHERE f.user_id = $1
     ORDER BY f.created_at DESC
     LIMIT $2 OFFSET $3`, [userId, pageSize, offset]);
    response.json({
        items: itemsResult.rows,
        pagination: { page, pageSize, total },
    });
});
// 记录浏览历史
exports.profileRouter.post("/history", async (request, response) => {
    const parsed = historyBodySchema.safeParse(request.body);
    if (!parsed.success) {
        response.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
        return;
    }
    const userId = request.session.user.id;
    const { articleId } = parsed.data;
    try {
        await (0, db_1.query)("INSERT INTO reading_history (user_id, article_id) VALUES ($1, $2)", [userId, articleId]);
        response.status(204).send();
    }
    catch (error) {
        response.status(500).json({ message: "记录失败" });
    }
});
// 浏览历史（分页，最近 50 条，联表 articles）
exports.profileRouter.get("/history", async (request, response) => {
    const parsed = pageSchema.safeParse(request.query);
    if (!parsed.success) {
        response.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
        return;
    }
    const userId = request.session.user.id;
    const { page, pageSize } = parsed.data;
    const offset = (page - 1) * pageSize;
    const countResult = await (0, db_1.query)(`SELECT COUNT(*)::text as count FROM reading_history WHERE user_id = $1`, [userId]);
    const total = parseInt(countResult.rows[0]?.count ?? "0", 10);
    const itemsResult = await (0, db_1.query)(`SELECT h.id, h.article_id, a.title, a.channel_code, a.category, h.viewed_at
     FROM reading_history h
     JOIN articles a ON a.id = h.article_id
     WHERE h.user_id = $1
     ORDER BY h.viewed_at DESC
     LIMIT $2 OFFSET $3`, [userId, pageSize, offset]);
    response.json({
        items: itemsResult.rows,
        pagination: { page, pageSize, total },
    });
});
