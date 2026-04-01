import { sql, eq } from "drizzle-orm";
import type { Db } from "../db/types.js";
import { users } from "../db/schema/index.js";

/**
 * Compute optimized FSRS parameters from a user's review history
 * and persist them. Fire-and-forget — caller should not await.
 */
export async function optimizeUserParams(db: Db, userId: string): Promise<void> {
  // Dynamic import — the binding package has native deps that may not be
  // available in all environments (e.g. lightweight test containers).
  const { computeParameters, FSRSBindingItem, FSRSBindingReview } = await import(
    "@open-spaced-repetition/binding"
  );

  // Load all reviews for this user, grouped by card, ordered chronologically
  const reviewRows = await db.execute<{
    card_id: string;
    rating: number;
    reviewed_at: string;
  }>(sql`
    SELECT r.card_id, r.rating, r.reviewed_at
    FROM reviews r
    JOIN cards c ON c.id = r.card_id
    JOIN topics t ON c.topic_id = t.id
    WHERE t.user_id = ${userId}
    ORDER BY r.card_id, r.reviewed_at ASC
  `);

  if (reviewRows.rows.length === 0) return;

  // Group reviews by card
  const cardReviews = new Map<string, Array<{ rating: number; reviewedAt: Date }>>();
  for (const row of reviewRows.rows) {
    const list = cardReviews.get(row.card_id) ?? [];
    list.push({ rating: row.rating, reviewedAt: new Date(row.reviewed_at) });
    cardReviews.set(row.card_id, list);
  }

  // Build FSRSBindingItems — one per card with 2+ reviews
  const items: InstanceType<typeof FSRSBindingItem>[] = [];
  for (const [, reviews] of cardReviews) {
    if (reviews.length < 2) continue; // need at least 2 reviews for meaningful data

    const bindingReviews = reviews.map((r, i) => {
      const deltaT = i === 0
        ? 0
        : Math.max(0, Math.round(
            (r.reviewedAt.getTime() - reviews[i - 1].reviewedAt.getTime()) / (1000 * 60 * 60 * 24)
          ));
      // Clamp rating to 1-4 (FSRS valid range)
      const rating = Math.max(1, Math.min(4, r.rating));
      return new FSRSBindingReview(rating, deltaT);
    });

    items.push(new FSRSBindingItem(bindingReviews));
  }

  if (items.length < 10) return; // not enough multi-review cards for meaningful optimization

  const optimizedW: number[] = await computeParameters(items, {
    enableShortTerm: true,
    timeout: 5000, // 5 second timeout for optimization
  });

  // Persist optimized params and reset counter
  await db
    .update(users)
    .set({
      fsrsParams: { w: optimizedW },
      reviewsSinceOptimization: 0,
    })
    .where(eq(users.id, userId));
}
