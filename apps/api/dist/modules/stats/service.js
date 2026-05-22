"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.statsService = void 0;
const db_1 = require("../../lib/db");
const store_1 = require("../../lib/store");
const toPercent = (success, total) => total === 0 ? 0 : Number(((success / total) * 100).toFixed(2));
const countEnabledSubscriptions = async () => {
    const result = await (0, db_1.query)(`
    SELECT COUNT(*)::text AS total
    FROM subscriptions
    WHERE enabled = TRUE
    `);
    return Number(result.rows[0]?.total ?? 0);
};
exports.statsService = {
    async getOverview(input) {
        const [pv, uv, articleViews, articlesPublished, pushSuccess, pushFailed, feedbackCount] = await Promise.all([
            store_1.analyticsEventStore.countByEventName({
                eventName: "page_view",
                startAt: input.startAt,
                endAt: input.endAt,
                channelCode: input.channelCode,
            }),
            store_1.analyticsEventStore.countDistinctUsers(input),
            store_1.analyticsEventStore.countByEventName({
                eventName: "article_view",
                startAt: input.startAt,
                endAt: input.endAt,
                channelCode: input.channelCode,
            }),
            store_1.analyticsEventStore.countByEventName({
                eventName: "article_published",
                startAt: input.startAt,
                endAt: input.endAt,
                channelCode: input.channelCode,
            }),
            store_1.analyticsEventStore.countByEventName({
                eventName: "push_sent",
                startAt: input.startAt,
                endAt: input.endAt,
                channelCode: input.channelCode,
            }),
            store_1.analyticsEventStore.countByEventName({
                eventName: "push_failed",
                startAt: input.startAt,
                endAt: input.endAt,
                channelCode: input.channelCode,
            }),
            store_1.analyticsEventStore.countByEventName({
                eventName: "feedback_created",
                startAt: input.startAt,
                endAt: input.endAt,
            }),
        ]);
        const pushTotal = pushSuccess + pushFailed;
        const [pageAgentConversationCount, pageAgentMessageCount, enabledSubscriptionCount] = await Promise.all([
            store_1.analyticsEventStore.countByEventName({
                eventName: "page_agent_conversation_created",
                startAt: input.startAt,
                endAt: input.endAt,
            }),
            store_1.analyticsEventStore.countByEventName({
                eventName: "page_agent_message_created",
                startAt: input.startAt,
                endAt: input.endAt,
            }),
            countEnabledSubscriptions(),
        ]);
        return {
            pv,
            uv,
            articleViews,
            articlesPublished,
            pushTotal,
            pushSuccess,
            pushFailed,
            pushSuccessRate: toPercent(pushSuccess, pushTotal),
            feedbackCount,
            pageAgentConversationCount,
            pageAgentMessageCount,
            enabledSubscriptionCount,
        };
    },
    async getDailyTrend(input) {
        return store_1.analyticsEventStore.listDailyTrend(input);
    },
    async getDistributions(input) {
        const [channelViews, channelPublishes, channelPushes, feedbackTypes] = await Promise.all([
            store_1.analyticsEventStore.listChannelMetricGroups({
                eventName: "article_view",
                startAt: input.startAt,
                endAt: input.endAt,
            }),
            store_1.analyticsEventStore.listChannelMetricGroups({
                eventName: "article_published",
                startAt: input.startAt,
                endAt: input.endAt,
            }),
            store_1.analyticsEventStore.listChannelMetricGroups({
                eventName: "push_sent",
                startAt: input.startAt,
                endAt: input.endAt,
            }),
            store_1.analyticsEventStore.listFeedbackTypeMetrics(input),
        ]);
        return {
            channelViews: { items: channelViews },
            channelPublishes: { items: channelPublishes },
            channelPushes: { items: channelPushes },
            feedbackTypes: { items: feedbackTypes },
        };
    },
    async getRankings(input) {
        const [topArticles, topChannels] = await Promise.all([
            store_1.analyticsEventStore.listTopArticles(input),
            store_1.analyticsEventStore.listTopChannels(input),
        ]);
        return {
            topArticles: { items: topArticles },
            topChannels: { items: topChannels },
        };
    },
    async getStatus() {
        return store_1.analyticsEventStore.getStatus();
    },
};
