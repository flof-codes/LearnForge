import { FastifyInstance } from "fastify";
import { eq, and, ne, ilike, sql, or, count, inArray } from "drizzle-orm";
import { db } from "../db/connection.js";
import { users, topics, cards, reviews } from "@learnforge/core";
import { NotFoundError, ValidationError } from "../lib/errors.js";
import { requireAdmin } from "../lib/auth-helpers.js";

const INVALID_HASH = "$invalid$";

export default async function adminRoutes(app: FastifyInstance) {
  app.get("/admin/stats", async (request) => {
    await requireAdmin(request);

    const [overview] = await db
      .select({ total: count() })
      .from(users)
      .where(ne(users.passwordHash, INVALID_HASH));

    const statusRows = await db
      .select({
        status: users.subscriptionStatus,
        count: count(),
      })
      .from(users)
      .where(ne(users.passwordHash, INVALID_HASH))
      .groupBy(users.subscriptionStatus);

    const billableRow = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE subscription_status = 'active') AS active,
        COUNT(*) FILTER (WHERE subscription_status = 'trialing') AS trialing,
        COUNT(*) FILTER (WHERE subscription_status = 'past_due') AS past_due,
        COUNT(*) FILTER (WHERE subscription_status = 'free') AS free_admin,
        COUNT(*) FILTER (WHERE subscription_status IN ('active', 'trialing', 'past_due')) AS total_billable
      FROM users
      WHERE password_hash <> ${INVALID_HASH}
    `);

    const freeTrialRow = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE trial_ends_at > NOW()) AS trial_active,
        COUNT(*) FILTER (WHERE trial_ends_at <= NOW()) AS trial_expired,
        COUNT(*) AS total_free
      FROM users
      WHERE password_hash <> ${INVALID_HASH}
        AND (subscription_status IS NULL
             OR subscription_status NOT IN ('active', 'trialing', 'past_due', 'free'))
    `);

    const activityRow = await db.execute(sql`
      SELECT
        COUNT(DISTINCT u.id) FILTER (WHERE c.id IS NOT NULL) AS users_with_cards,
        COUNT(DISTINCT u.id) FILTER (WHERE r.id IS NOT NULL) AS users_with_reviews
      FROM users u
      LEFT JOIN topics t ON t.user_id = u.id
      LEFT JOIN cards c ON c.topic_id = t.id
      LEFT JOIN reviews r ON r.card_id = c.id
      WHERE u.password_hash <> ${INVALID_HASH}
    `);

    const toNum = (v: unknown) => (v == null ? 0 : Number(v));
    const billable = billableRow.rows[0] as Record<string, unknown>;
    const freeTrial = freeTrialRow.rows[0] as Record<string, unknown>;
    const activity = activityRow.rows[0] as Record<string, unknown>;

    return {
      totalUsers: toNum(overview?.total),
      statusBreakdown: statusRows.map((r) => ({
        status: r.status ?? "(none)",
        count: toNum(r.count),
      })),
      billable: {
        active: toNum(billable.active),
        trialing: toNum(billable.trialing),
        pastDue: toNum(billable.past_due),
        freeAdmin: toNum(billable.free_admin),
        totalBillable: toNum(billable.total_billable),
      },
      freeTrial: {
        trialActive: toNum(freeTrial.trial_active),
        trialExpired: toNum(freeTrial.trial_expired),
        totalFree: toNum(freeTrial.total_free),
      },
      activity: {
        usersWithCards: toNum(activity.users_with_cards),
        usersWithReviews: toNum(activity.users_with_reviews),
      },
    };
  });

  app.get<{ Querystring: { search?: string; limit?: string; offset?: string } }>(
    "/admin/users",
    async (request) => {
      await requireAdmin(request);
      const { search, limit: limitRaw, offset: offsetRaw } = request.query ?? {};

      const limit = Math.min(Math.max(parseInt(limitRaw ?? "50", 10) || 50, 1), 200);
      const offset = Math.max(parseInt(offsetRaw ?? "0", 10) || 0, 0);

      const baseWhere = ne(users.passwordHash, INVALID_HASH);
      const whereClause = search && search.trim()
        ? and(
            baseWhere,
            or(
              ilike(users.email, `%${search.trim()}%`),
              ilike(users.name, `%${search.trim()}%`),
            ),
          )
        : baseWhere;

      const [totalRow] = await db
        .select({ total: count() })
        .from(users)
        .where(whereClause);

      const rows = await db
        .select({
          id: users.id,
          email: users.email,
          name: users.name,
          role: users.role,
          subscriptionStatus: users.subscriptionStatus,
          subscriptionCurrentPeriodEnd: users.subscriptionCurrentPeriodEnd,
          trialEndsAt: users.trialEndsAt,
          createdAt: users.createdAt,
          stripeCustomerId: users.stripeCustomerId,
        })
        .from(users)
        .where(whereClause)
        .orderBy(sql`${users.createdAt} DESC`)
        .limit(limit)
        .offset(offset);

      const userIds = rows.map((r) => r.id);

      let cardCounts = new Map<string, number>();
      let reviewCounts = new Map<string, number>();
      if (userIds.length > 0) {
        const cardRows = await db
          .select({ userId: topics.userId, count: count(cards.id) })
          .from(topics)
          .leftJoin(cards, eq(cards.topicId, topics.id))
          .where(inArray(topics.userId, userIds))
          .groupBy(topics.userId);
        cardCounts = new Map(cardRows.map((r) => [r.userId, Number(r.count)]));

        const reviewRows = await db
          .select({ userId: topics.userId, count: count(reviews.id) })
          .from(topics)
          .leftJoin(cards, eq(cards.topicId, topics.id))
          .leftJoin(reviews, eq(reviews.cardId, cards.id))
          .where(inArray(topics.userId, userIds))
          .groupBy(topics.userId);
        reviewCounts = new Map(reviewRows.map((r) => [r.userId, Number(r.count)]));
      }

      return {
        total: Number(totalRow?.total ?? 0),
        limit,
        offset,
        users: rows.map((r) => ({
          id: r.id,
          email: r.email,
          name: r.name,
          role: r.role,
          subscriptionStatus: r.subscriptionStatus,
          subscriptionCurrentPeriodEnd: r.subscriptionCurrentPeriodEnd,
          trialEndsAt: r.trialEndsAt,
          createdAt: r.createdAt,
          hasStripeCustomer: !!r.stripeCustomerId,
          cardCount: cardCounts.get(r.id) ?? 0,
          reviewCount: reviewCounts.get(r.id) ?? 0,
        })),
      };
    },
  );

  app.post<{ Params: { id: string } }>("/admin/users/:id/grant-free", async (request) => {
    await requireAdmin(request);
    const { id } = request.params;

    const [target] = await db
      .select({ id: users.id, status: users.subscriptionStatus })
      .from(users)
      .where(and(eq(users.id, id), ne(users.passwordHash, INVALID_HASH)));
    if (!target) throw new NotFoundError("User not found");
    if (target.status === "free") {
      throw new ValidationError("User already has a free account");
    }

    await db
      .update(users)
      .set({
        subscriptionStatus: "free",
        subscriptionCurrentPeriodEnd: null,
      })
      .where(eq(users.id, id));

    return { success: true };
  });

  app.post<{ Params: { id: string } }>("/admin/users/:id/revoke-free", async (request) => {
    await requireAdmin(request);
    const { id } = request.params;

    const [target] = await db
      .select({ id: users.id, status: users.subscriptionStatus, role: users.role })
      .from(users)
      .where(and(eq(users.id, id), ne(users.passwordHash, INVALID_HASH)));
    if (!target) throw new NotFoundError("User not found");
    if (target.status !== "free") {
      throw new ValidationError("User does not have a free account");
    }
    if (target.role === "admin") {
      throw new ValidationError("Cannot revoke free access from an admin");
    }

    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 30);

    await db
      .update(users)
      .set({
        subscriptionStatus: null,
        subscriptionCurrentPeriodEnd: null,
        trialEndsAt,
      })
      .where(eq(users.id, id));

    return { success: true };
  });
}
