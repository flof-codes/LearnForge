import { sql } from "drizzle-orm";
import type { Db } from "../db/types.js";
import { FIGURE_FIELD, FRONT_FIGURE_FIELD, figuresOf, type CardFigures } from "../lib/figures.js";

export interface CardFigureInfo extends CardFigures {
  /** The note type's built-in key ("open", "occlusion" …), null for own types and legacy cards. */
  builtinKey: string | null;
}

const NONE: CardFigureInfo = { figure: null, frontFigure: null, builtinKey: null };

/** The figure fields of each card's note. Legacy cards without a note have none. */
export async function loadCardFigures(db: Db, userId: string, cardIds: string[]): Promise<Map<string, CardFigureInfo>> {
  const out = new Map<string, CardFigureInfo>();
  if (cardIds.length === 0) return out;
  const ids = sql.join(cardIds.map(id => sql`${id}::uuid`), sql`, `);
  const rows = await db.execute<{ card_id: string; fields: Record<string, string>; builtin_key: string | null; key: string | null; name: string | null }>(sql`
    SELECT c.id AS card_id, n.fields, nt.builtin_key, f.key, f.name
    FROM cards c
    JOIN notes n ON n.id = c.note_id AND n.user_id = ${userId}
    JOIN note_types nt ON nt.id = n.note_type_id
    LEFT JOIN note_type_fields f ON f.note_type_id = nt.id AND f.name IN (${FIGURE_FIELD}, ${FRONT_FIGURE_FIELD})
    WHERE c.id IN (${ids})
  `);
  const byCard = new Map<string, typeof rows.rows>();
  for (const r of rows.rows) byCard.set(r.card_id, [...(byCard.get(r.card_id) ?? []), r]);
  for (const [cardId, list] of byCard) {
    const defs = list.filter(r => r.key && r.name).map(r => ({ key: r.key!, name: r.name! }));
    out.set(cardId, { ...figuresOf(defs, list[0].fields ?? {}), builtinKey: list[0].builtin_key });
  }
  return out;
}

export function figuresFor(map: Map<string, CardFigureInfo>, cardId: string): CardFigureInfo {
  return map.get(cardId) ?? NONE;
}
