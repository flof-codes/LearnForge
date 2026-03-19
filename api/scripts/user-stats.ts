#!/usr/bin/env npx tsx
// Show user counts by subscription status.
// Run with: cd api && npx tsx scripts/user-stats.ts

import pg from "pg";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://learnforge:learnforge@localhost:5432/learnforge";

async function main() {
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();

  try {
    const { rows } = await client.query<{ status: string; count: string }>(`
      SELECT
        CASE
          WHEN subscription_status = 'active'
           AND subscription_current_period_end > now()
          THEN 'Subscribed'
          WHEN trial_ends_at > now()
          THEN 'Trial (active)'
          ELSE 'Inactive'
        END AS status,
        count(*)::text AS count
      FROM users
      WHERE password_hash != '$invalid$'
      GROUP BY status
      ORDER BY count DESC
    `);

    const counts = new Map(rows.map((r) => [r.status, Number(r.count)]));
    const total = rows.reduce((sum, r) => sum + Number(r.count), 0);

    console.log();
    console.log("LearnForge User Stats");
    console.log("=====================");
    for (const label of ["Trial (active)", "Subscribed", "Inactive"]) {
      console.log(`${label.padEnd(18)} ${String(counts.get(label) ?? 0).padStart(4)}`);
    }
    console.log("─────────────────────");
    console.log(`${"Total".padEnd(18)} ${String(total).padStart(4)}`);
    console.log();
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
