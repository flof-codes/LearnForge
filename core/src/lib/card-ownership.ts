import { sql } from "drizzle-orm";
import type { Db } from "../db/types.js";
import { NotFoundError } from "./errors.js";

export async function verifyCardOwnership(db: Db, cardId: string, userId: string): Promise<void> {
  const result = await db.execute<{ id: string }>(sql`
    SELECT c.id FROM cards c
    JOIN topics t ON c.topic_id = t.id
    WHERE c.id = ${cardId} AND t.user_id = ${userId}
  `);
  if (result.rows.length === 0) throw new NotFoundError("Card not found");
}
