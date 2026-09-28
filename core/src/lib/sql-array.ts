import { sql, type SQL } from "drizzle-orm";

/**
 * A text[] literal for drizzle's sql template. Passing a JS array as a plain
 * parameter expands it into a comma list, which is empty for [] and breaks the
 * statement; ARRAY[...] with a cast is valid for every length.
 */
export function textArray(values: string[]): SQL {
  if (values.length === 0) return sql`ARRAY[]::text[]`;
  return sql`ARRAY[${sql.join(values.map(v => sql`${v}`), sql`, `)}]::text[]`;
}
