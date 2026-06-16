import { query } from "../../lib/db";
import { analyticsEventStore } from "../../lib/store";
import { StatsDistributions, StatsOverview, StatsRankings, StatsStatus } from "../../lib/types";

const toPercent = (success: number, total: number): number =>
  total === 0 ? 0 : Number(((success / total) * 100).toFixed(2));

const countEnabledSubscriptions = async (): Promise<number> => {
  const result = await query<{ total: string }>(
    `
    SELECT COUNT(*)::text AS total
    FROM subscriptions
    WHERE enabled = TRUE
    `
  );
  return Number(result.rows[0]?.total ?? 0);
};

export const statsService = {
  async getOverview(input: {
    startAt?: string;
    endAt?: string;
    channelCode?: string;
  }): Promise<StatsOverview> {
    const [pv, uv, articleViews, articlesPublished, feedbackCount] =
      await Promise.all([
        analyticsEventStore.countByEventName({
          eventName: "page_view",
          startAt: input.startAt,
          endAt: input.endAt,
          channelCode: input.channelCode,
        }),
        analyticsEventStore.countDistinctUsers(input),
        analyticsEventStore.countByEventName({
          eventName: "article_view",
          startAt: input.startAt,
          endAt: input.endAt,
          channelCode: input.channelCode,
        }),
        analyticsEventStore.countByEventName({
          eventName: "article_published",
          startAt: input.startAt,
          endAt: input.endAt,
          channelCode: input.channelCode,
        }),
        analyticsEventStore.countByEventName({
          eventName: "feedback_created",
          startAt: input.startAt,
          endAt: input.endAt,
        }),
      ]);

    const pushResult = await query<{ sent: string; failed: string }>(
      `SELECT
         COALESCE(SUM(CASE WHEN event_name = 'push_sent'
           THEN COALESCE((event_payload->>'targetCount')::int, 1)
           ELSE 0 END), 0)::text AS sent,
         COALESCE(SUM(CASE WHEN event_name = 'push_failed'
           THEN COALESCE((event_payload->>'targetCount')::int, 1)
           ELSE 0 END), 0)::text AS failed
       FROM analytics_events
       WHERE event_name IN ('push_sent', 'push_failed')
         AND ($1::timestamptz IS NULL OR occurred_at >= $1::timestamptz)
         AND ($2::timestamptz IS NULL OR occurred_at <= $2::timestamptz)`,
      [input.startAt || null, input.endAt || null]
    );
    const pushSuccess = Number(pushResult.rows[0]?.sent ?? 0);
    const pushFailed = Number(pushResult.rows[0]?.failed ?? 0);

    const pushTotal = pushSuccess + pushFailed;

    const [pageAgentConversationCount, pageAgentMessageCount, enabledSubscriptionCount] =
      await Promise.all([
        analyticsEventStore.countByEventName({
          eventName: "page_agent_conversation_created",
          startAt: input.startAt,
          endAt: input.endAt,
        }),
        analyticsEventStore.countByEventName({
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
  async getDailyTrend(input: {
    startAt: string;
    endAt: string;
  }): Promise<Array<{ date: string; pv: number; uv: number; articleViews: number }>> {
    return analyticsEventStore.listDailyTrend(input);
  },
  async getDistributions(input: {
    startAt: string;
    endAt: string;
  }): Promise<StatsDistributions> {
    const [channelViews, channelPublishes, channelPushes, feedbackTypes] =
      await Promise.all([
        analyticsEventStore.listChannelMetricGroups({
          eventName: "article_view",
          startAt: input.startAt,
          endAt: input.endAt,
        }),
        analyticsEventStore.listChannelMetricGroups({
          eventName: "article_published",
          startAt: input.startAt,
          endAt: input.endAt,
        }),
        analyticsEventStore.listChannelMetricGroups({
          eventName: "push_sent",
          startAt: input.startAt,
          endAt: input.endAt,
        }),
        analyticsEventStore.listFeedbackTypeMetrics(input),
      ]);

    return {
      channelViews: { items: channelViews },
      channelPublishes: { items: channelPublishes },
      channelPushes: { items: channelPushes },
      feedbackTypes: { items: feedbackTypes },
    };
  },
  async getRankings(input: {
    startAt: string;
    endAt: string;
    limit: number;
  }): Promise<StatsRankings> {
    const [topArticles, topChannels] = await Promise.all([
      analyticsEventStore.listTopArticles(input),
      analyticsEventStore.listTopChannels(input),
    ]);

    return {
      topArticles: { items: topArticles },
      topChannels: { items: topChannels },
    };
  },
  async getStatus(): Promise<StatsStatus> {
    return analyticsEventStore.getStatus();
  },
};
