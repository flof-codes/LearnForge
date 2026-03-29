#!/usr/bin/env bash
# Usage: ssh into production server, then run:
#   cd /path/to/LearnForge && bash scripts/user-stats.sh
#
# Runs against the db container via docker compose.

set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"

docker compose -f "$COMPOSE_FILE" exec -T db psql -U learnforge -d learnforge <<'SQL'
\pset footer off

-- Header
SELECT '========================================' AS "";
SELECT '  LearnForge User & Subscription Stats' AS "";
SELECT '  ' || NOW()::date AS "";
SELECT '========================================' AS "";
SELECT '' AS "";

-- Total registered users (exclude migration user)
SELECT '--- Overview ---' AS "";
SELECT
  COUNT(*) AS "Total Registered Users"
FROM users
WHERE password_hash != '$invalid$';

-- Subscription breakdown
SELECT '' AS "";
SELECT '--- Subscription Status Breakdown ---' AS "";
SELECT
  COALESCE(subscription_status, '(none)') AS "Status",
  COUNT(*) AS "Users"
FROM users
WHERE password_hash != '$invalid$'
GROUP BY subscription_status
ORDER BY "Users" DESC;

-- Active paying subscribers (active, trialing, past_due)
SELECT '' AS "";
SELECT '--- Paying / Billable Users ---' AS "";
SELECT
  COUNT(*) FILTER (WHERE subscription_status = 'active') AS "Active",
  COUNT(*) FILTER (WHERE subscription_status = 'trialing') AS "Trialing",
  COUNT(*) FILTER (WHERE subscription_status = 'past_due') AS "Past Due",
  COUNT(*) FILTER (WHERE subscription_status IN ('active', 'trialing', 'past_due')) AS "Total Billable"
FROM users
WHERE password_hash != '$invalid$';

-- Trial status for users WITHOUT a Stripe subscription
SELECT '' AS "";
SELECT '--- Free / Trial Users (no Stripe subscription) ---' AS "";
SELECT
  COUNT(*) FILTER (WHERE trial_ends_at > NOW()) AS "Trial Active",
  COUNT(*) FILTER (WHERE trial_ends_at <= NOW()) AS "Trial Expired",
  COUNT(*) AS "Total Free"
FROM users
WHERE password_hash != '$invalid$'
  AND (subscription_status IS NULL OR subscription_status NOT IN ('active', 'trialing', 'past_due'));

-- Activity: users with at least one card or review
SELECT '' AS "";
SELECT '--- Activity ---' AS "";
SELECT
  COUNT(DISTINCT u.id) FILTER (WHERE c.id IS NOT NULL) AS "Users With Cards",
  COUNT(DISTINCT u.id) FILTER (WHERE r.id IS NOT NULL) AS "Users With Reviews"
FROM users u
LEFT JOIN topics t ON t.user_id = u.id
LEFT JOIN cards c ON c.topic_id = t.id
LEFT JOIN reviews r ON r.card_id = c.id
WHERE u.password_hash != '$invalid$';

SELECT '' AS "";
SQL
