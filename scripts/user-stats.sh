#!/usr/bin/env bash
# Usage: ssh into production server, then run:
#   bash scripts/user-stats.sh
#
# Runs against the db container via docker compose.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
COMPOSE_FILE="${COMPOSE_FILE:-$PROJECT_DIR/docker-compose.prod.yml}"

docker compose -f "$COMPOSE_FILE" exec -T db psql -U learnforge -d learnforge <<'SQL'
\pset footer off

\echo ''
\echo '========================================'
\echo '  LearnForge User & Subscription Stats'
\echo '========================================'
\echo ''

\echo '--- Overview ---'
SELECT COUNT(*) AS "Total Registered Users"
FROM users
WHERE password_hash != '$invalid$';

\echo ''
\echo '--- Subscription Status Breakdown ---'
SELECT
  COALESCE(subscription_status, '(none)') AS "Status",
  COUNT(*) AS "Users"
FROM users
WHERE password_hash != '$invalid$'
GROUP BY subscription_status
ORDER BY "Users" DESC;

\echo ''
\echo '--- Paying / Billable Users ---'
SELECT
  COUNT(*) FILTER (WHERE subscription_status = 'active') AS "Active",
  COUNT(*) FILTER (WHERE subscription_status = 'trialing') AS "Trialing",
  COUNT(*) FILTER (WHERE subscription_status = 'past_due') AS "Past Due",
  COUNT(*) FILTER (WHERE subscription_status IN ('active', 'trialing', 'past_due')) AS "Total Billable"
FROM users
WHERE password_hash != '$invalid$';

\echo ''
\echo '--- Free / Trial Users (no Stripe subscription) ---'
SELECT
  COUNT(*) FILTER (WHERE trial_ends_at > NOW()) AS "Trial Active",
  COUNT(*) FILTER (WHERE trial_ends_at <= NOW()) AS "Trial Expired",
  COUNT(*) AS "Total Free"
FROM users
WHERE password_hash != '$invalid$'
  AND (subscription_status IS NULL OR subscription_status NOT IN ('active', 'trialing', 'past_due'));

\echo ''
\echo '--- Activity ---'
SELECT
  COUNT(DISTINCT u.id) FILTER (WHERE c.id IS NOT NULL) AS "Users With Cards",
  COUNT(DISTINCT u.id) FILTER (WHERE r.id IS NOT NULL) AS "Users With Reviews"
FROM users u
LEFT JOIN topics t ON t.user_id = u.id
LEFT JOIN cards c ON c.topic_id = t.id
LEFT JOIN reviews r ON r.card_id = c.id
WHERE u.password_hash != '$invalid$';

\echo ''
SQL
