#!/usr/bin/env npx tsx
// Create a new user in the LearnForge database.
// Run with: cd api && npx tsx ../scripts/create-user.ts

import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { randomUUID } from "node:crypto";
import argon2 from "argon2";
import pg from "pg";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://learnforge:learnforge@localhost:5432/learnforge";

async function main() {
  const rl = createInterface({ input: stdin, output: stdout });

  try {
    const email = await rl.question("Email: ");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      console.error("Invalid email format");
      process.exit(1);
    }

    const name = await rl.question("Name: ");
    if (!name.trim()) {
      console.error("Name is required");
      process.exit(1);
    }

    const password = await rl.question("Password (min 8 chars): ");
    if (password.length < 8) {
      console.error("Password must be at least 8 characters");
      process.exit(1);
    }

    const confirm = await rl.question("Confirm password: ");
    if (password !== confirm) {
      console.error("Passwords do not match");
      process.exit(1);
    }

    const hash = await argon2.hash(password, { type: argon2.argon2id });
    const id = randomUUID();

    const client = new pg.Client({ connectionString: DATABASE_URL });
    await client.connect();

    try {
      await client.query(
        `INSERT INTO users (id, email, password_hash, name) VALUES ($1, $2, $3, $4)`,
        [id, email.toLowerCase().trim(), hash, name.trim()]
      );
      console.log(`\nUser created successfully!`);
      console.log(`  ID:    ${id}`);
      console.log(`  Email: ${email.toLowerCase().trim()}`);
      console.log(`  Name:  ${name.trim()}`);
    } finally {
      await client.end();
    }
  } finally {
    rl.close();
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
