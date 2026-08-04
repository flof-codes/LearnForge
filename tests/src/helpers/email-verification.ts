import pg from "pg";
import { TEST_CONFIG } from "./fixtures.js";

/**
 * Marks an account's e-mail address as confirmed, directly in the DB.
 *
 * Registration deliberately leaves an account unverified, and the API blocks
 * every write until the mailed link is opened — which no test can do, since the
 * test environment has no SMTP server. Suites that register a throwaway user and
 * then exercise unrelated write paths call this to get past that gate.
 *
 * The verification flow itself is covered end-to-end in 28-email-verification.
 */
export async function markEmailVerified(email: string): Promise<void> {
  const client = new pg.Client({
    host: "localhost",
    port: TEST_CONFIG.dbPort,
    user: TEST_CONFIG.dbUser,
    password: TEST_CONFIG.dbPassword,
    database: TEST_CONFIG.dbName,
  });
  await client.connect();
  try {
    await client.query(`UPDATE users SET email_verified_at = now() WHERE email = $1`, [
      email.toLowerCase().trim(),
    ]);
  } finally {
    await client.end();
  }
}
