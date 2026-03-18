-- ============================================================================
-- LearnForge Integration Test — Seed Data
-- ============================================================================
-- UUIDs use readable prefixes:
--   00000000-...-0099 = test user
--   00000000-...-0098 = second test user (for multi-tenancy tests)
--   10000000-... = topics
--   20000000-... = cards
--   30000000-... = images
--   40000000-... = reviews
-- ============================================================================

-- Helper: generate deterministic 384-dim vectors from an integer seed
CREATE OR REPLACE FUNCTION _fake_emb(seed int) RETURNS vector AS $$
  SELECT array_agg(sin(seed * 0.7 + i * 0.1))::vector(384)
  FROM generate_series(1, 384) AS i
$$ LANGUAGE sql;

-- ── Users (2 rows) ──────────────────────────────────────────────────────────
-- Password for both: 'test-password'
-- argon2id hash of 'test-password':
-- $argon2id$v=19$m=65536,t=3,p=4$HPGkNxgQCYEoCAQAW0ycNg$y6zGOdfZtsbRNPQApTmbFpfnzDwSJSCCPp2Uy3nArn8

INSERT INTO users (id, email, password_hash, name, mcp_api_key_hash, mcp_api_key_created_at, trial_ends_at) VALUES
  ('00000000-0000-0000-0000-000000000099',
   'test@learnforge.dev',
   '$argon2id$v=19$m=65536,t=3,p=4$HPGkNxgQCYEoCAQAW0ycNg$y6zGOdfZtsbRNPQApTmbFpfnzDwSJSCCPp2Uy3nArn8',
   'Test User',
   'b398cd4aff7b2b6fad9537e2bc8a690f43974ecf3bb4b8f1f79b044de7e42d00',
   NOW(),
   NOW() + INTERVAL '30 days'),
  ('00000000-0000-0000-0000-000000000098',
   'other@learnforge.dev',
   '$argon2id$v=19$m=65536,t=3,p=4$HPGkNxgQCYEoCAQAW0ycNg$y6zGOdfZtsbRNPQApTmbFpfnzDwSJSCCPp2Uy3nArn8',
   'Other User',
   NULL,
   NULL,
   NOW() + INTERVAL '30 days');

-- ── Topics (6 rows) ────────────────────────────────────────────────────────

INSERT INTO topics (id, parent_id, name, description, user_id) VALUES
  ('10000000-0000-0000-0000-000000000001', NULL,                                       'Mathematics',      'Fundamental math concepts',               '00000000-0000-0000-0000-000000000099'),
  ('10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001',      'Algebra',          'Algebraic expressions and equations',     '00000000-0000-0000-0000-000000000099'),
  ('10000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000002',      'Linear Equations', 'First-degree equations and graphing',     '00000000-0000-0000-0000-000000000099'),
  ('10000000-0000-0000-0000-000000000004', NULL,                                       'Biology',          'Life sciences',                           '00000000-0000-0000-0000-000000000099'),
  ('10000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000004',      'Cell Biology',     'Cellular structures and processes',       '00000000-0000-0000-0000-000000000099'),
  ('10000000-0000-0000-0000-000000000006', NULL,                                       'Empty Topic',       NULL,                                     '00000000-0000-0000-0000-000000000099');

-- ── Cards (12 rows) ────────────────────────────────────────────────────────
-- Columns: id, topic_id, concept, front_html, back_html, tags, embedding

INSERT INTO cards (id, topic_id, concept, front_html, back_html, tags, embedding) VALUES
  -- Card 1: Math, New, Bloom 0, due past
  ('20000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000001',
   'Addition basics',
   '<div class="lf-card"><h2>What is 2 + 3?</h2></div>',
   '<div class="lf-card"><p>2 + 3 = <span class="lf-highlight">5</span></p></div>',
   ARRAY['arithmetic', 'addition'],
   _fake_emb(1)),

  -- Card 2: Math, New, Bloom 0, due past
  ('20000000-0000-0000-0000-000000000002',
   '10000000-0000-0000-0000-000000000001',
   'Subtraction basics',
   '<div class="lf-card"><h2>What is 7 - 4?</h2></div>',
   '<div class="lf-card"><p>7 - 4 = <span class="lf-highlight">3</span></p></div>',
   ARRAY['arithmetic', 'subtraction'],
   _fake_emb(2)),

  -- Card 3: Algebra, Learning, Bloom 1, due past
  ('20000000-0000-0000-0000-000000000003',
   '10000000-0000-0000-0000-000000000002',
   'Solve for x',
   '<div class="lf-card"><h2>Solve: 2x + 5 = 11</h2></div>',
   '<div class="lf-card"><p>x = <span class="lf-highlight">3</span></p></div>',
   ARRAY['algebra', 'equations'],
   _fake_emb(3)),

  -- Card 4: Algebra, Learning, Bloom 2, due future
  ('20000000-0000-0000-0000-000000000004',
   '10000000-0000-0000-0000-000000000002',
   'Quadratic formula',
   '<div class="lf-card"><h2>State the quadratic formula</h2></div>',
   '<div class="lf-card"><p>x = (-b +/- sqrt(b^2 - 4ac)) / 2a</p></div>',
   ARRAY['algebra', 'quadratic'],
   _fake_emb(4)),

  -- Card 5: Linear Equations, Review, Bloom 3, due past
  ('20000000-0000-0000-0000-000000000005',
   '10000000-0000-0000-0000-000000000003',
   'Slope-intercept form',
   '<div class="lf-card"><h2>What is slope-intercept form?</h2></div>',
   '<div class="lf-card"><p>y = <span class="lf-highlight">mx + b</span></p></div>',
   ARRAY['linear', 'graphing'],
   _fake_emb(5)),

  -- Card 6: Linear Equations, Review, Bloom 4, due future
  ('20000000-0000-0000-0000-000000000006',
   '10000000-0000-0000-0000-000000000003',
   'Point-slope form',
   '<div class="lf-card"><h2>What is point-slope form?</h2></div>',
   '<div class="lf-card"><p>y - y1 = m(x - x1)</p></div>',
   ARRAY['linear', 'graphing'],
   _fake_emb(6)),

  -- Card 7: Math, Relearning, Bloom 1, due past
  ('20000000-0000-0000-0000-000000000007',
   '10000000-0000-0000-0000-000000000001',
   'Multiplication tables',
   '<div class="lf-card"><h2>What is 8 x 7?</h2></div>',
   '<div class="lf-card"><p>8 x 7 = <span class="lf-highlight">56</span></p></div>',
   ARRAY['arithmetic', 'multiplication'],
   _fake_emb(7)),

  -- Card 8: Math, Review, Bloom 5, due future (far)
  ('20000000-0000-0000-0000-000000000008',
   '10000000-0000-0000-0000-000000000001',
   'Division rules',
   '<div class="lf-card"><h2>Explain division by zero</h2></div>',
   '<div class="lf-card"><p>Division by zero is <span class="lf-highlight">undefined</span></p></div>',
   ARRAY['arithmetic', 'division'],
   _fake_emb(8)),

  -- Card 9: Biology, New, Bloom 0, due past
  ('20000000-0000-0000-0000-000000000009',
   '10000000-0000-0000-0000-000000000004',
   'Cell structure',
   '<div class="lf-card"><h2>Name the main parts of a cell</h2></div>',
   '<div class="lf-card"><p>Nucleus, membrane, cytoplasm</p></div>',
   ARRAY['biology', 'cells'],
   _fake_emb(9)),

  -- Card 10: Cell Biology, Learning, Bloom 2, due past
  ('20000000-0000-0000-0000-000000000010',
   '10000000-0000-0000-0000-000000000005',
   'Mitosis phases',
   '<div class="lf-card"><h2>List the phases of mitosis</h2></div>',
   '<div class="lf-card"><p>Prophase, Metaphase, Anaphase, Telophase</p></div>',
   ARRAY['biology', 'mitosis'],
   _fake_emb(10)),

  -- Card 11: Cell Biology, Review, Bloom 3, due past
  ('20000000-0000-0000-0000-000000000011',
   '10000000-0000-0000-0000-000000000005',
   'DNA replication',
   '<div class="lf-card"><h2>Describe semi-conservative replication</h2></div>',
   '<div class="lf-card"><p>Each new DNA molecule has one old and one new strand</p></div>',
   ARRAY['biology', 'dna'],
   _fake_emb(11)),

  -- Card 12: Biology, New, Bloom 0, due past — NULL embedding
  ('20000000-0000-0000-0000-000000000012',
   '10000000-0000-0000-0000-000000000004',
   'Photosynthesis overview',
   '<div class="lf-card"><h2>What is photosynthesis?</h2></div>',
   '<div class="lf-card"><p>Converting light energy to chemical energy</p></div>',
   ARRAY['biology', 'photosynthesis'],
   NULL);

-- ── Bloom State (12 rows) ──────────────────────────────────────────────────

INSERT INTO bloom_state (card_id, current_level, highest_reached) VALUES
  ('20000000-0000-0000-0000-000000000001', 0, 0),  -- New: Remember
  ('20000000-0000-0000-0000-000000000002', 0, 0),  -- New: Remember
  ('20000000-0000-0000-0000-000000000003', 1, 1),  -- Learning: Understand
  ('20000000-0000-0000-0000-000000000004', 2, 2),  -- Learning: Apply
  ('20000000-0000-0000-0000-000000000005', 3, 3),  -- Review: Analyze
  ('20000000-0000-0000-0000-000000000006', 4, 4),  -- Review: Evaluate
  ('20000000-0000-0000-0000-000000000007', 1, 2),  -- Relearning: Understand (was at Apply)
  ('20000000-0000-0000-0000-000000000008', 5, 5),  -- Review: Create
  ('20000000-0000-0000-0000-000000000009', 0, 0),  -- New: Remember
  ('20000000-0000-0000-0000-000000000010', 2, 2),  -- Learning: Apply
  ('20000000-0000-0000-0000-000000000011', 3, 3),  -- Review: Analyze
  ('20000000-0000-0000-0000-000000000012', 0, 0);  -- New: Remember

-- ── FSRS State (12 rows) ───────────────────────────────────────────────────
-- state: 0=New, 1=Learning, 2=Review, 3=Relearning

INSERT INTO fsrs_state (card_id, stability, difficulty, due, last_review, reps, lapses, state) VALUES
  -- New cards (state=0): no reviews yet
  ('20000000-0000-0000-0000-000000000001', 0,    0,    NOW() - INTERVAL '1 hour',  NULL,                          0, 0, 0),
  ('20000000-0000-0000-0000-000000000002', 0,    0,    NOW() - INTERVAL '1 hour',  NULL,                          0, 0, 0),

  -- Learning cards (state=1): a few reviews
  ('20000000-0000-0000-0000-000000000003', 4.5,  5.5,  NOW() - INTERVAL '30 minutes', NOW() - INTERVAL '2 days', 2, 0, 1),
  ('20000000-0000-0000-0000-000000000004', 3.8,  5.8,  NOW() + INTERVAL '2 days',     NOW() - INTERVAL '1 day',  2, 0, 1),

  -- Review cards (state=2): stable, multiple reviews
  ('20000000-0000-0000-0000-000000000005', 15.2, 4.8,  NOW() - INTERVAL '2 hours',    NOW() - INTERVAL '5 days', 4, 0, 2),
  ('20000000-0000-0000-0000-000000000006', 22.5, 4.2,  NOW() + INTERVAL '5 days',     NOW() - INTERVAL '3 days', 5, 0, 2),

  -- Relearning card (state=3): lapsed
  ('20000000-0000-0000-0000-000000000007', 2.8,  7.2,  NOW() - INTERVAL '10 minutes', NOW() - INTERVAL '1 day',  3, 1, 3),

  -- Review (mature): high stability, far future due
  ('20000000-0000-0000-0000-000000000008', 45.0, 3.5,  NOW() + INTERVAL '30 days',    NOW() - INTERVAL '10 days', 6, 0, 2),

  -- Bio New cards
  ('20000000-0000-0000-0000-000000000009', 0,    0,    NOW() - INTERVAL '1 hour',  NULL,                          0, 0, 0),

  -- Bio Learning
  ('20000000-0000-0000-0000-000000000010', 3.2,  6.0,  NOW() - INTERVAL '5 minutes',  NOW() - INTERVAL '1 day',  2, 0, 1),

  -- Bio Review
  ('20000000-0000-0000-0000-000000000011', 18.0, 4.5,  NOW() - INTERVAL '1 day',      NOW() - INTERVAL '7 days', 3, 0, 2),

  -- Bio New (no embedding)
  ('20000000-0000-0000-0000-000000000012', 0,    0,    NOW() - INTERVAL '1 hour',  NULL,                          0, 0, 0);

-- ── Reviews (19 rows) ──────────────────────────────────────────────────────
-- Chronological reviews for cards with history.
-- reviewed_at timestamps are spaced out in the past.

-- Card 3 (Solve for x): ratings [3, 3], modalities [web, chat]
INSERT INTO reviews (id, card_id, bloom_level, rating, question_text, modality, reviewed_at) VALUES
  ('40000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000003', 0, 3, 'What is x in 2x+5=11?', 'web',  NOW() - INTERVAL '3 days'),
  ('40000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000003', 1, 3, 'Explain solving for x',  'chat', NOW() - INTERVAL '2 days');

-- Card 5 (Slope-intercept): ratings [3, 4, 3, 2], modalities [web, web, chat, web]
INSERT INTO reviews (id, card_id, bloom_level, rating, question_text, modality, reviewed_at) VALUES
  ('40000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000005', 0, 3, 'Define slope-intercept form',      'web',  NOW() - INTERVAL '14 days'),
  ('40000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000005', 1, 4, 'Write y=mx+b from given values',   'web',  NOW() - INTERVAL '10 days'),
  ('40000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000005', 2, 3, 'Compare to standard form',          'chat', NOW() - INTERVAL '6 days'),
  ('40000000-0000-0000-0000-000000000006', '20000000-0000-0000-0000-000000000005', 3, 2, 'Analyze slope changes in context',  'web',  NOW() - INTERVAL '5 days');

-- Card 6 (Point-slope): ratings [3, 3, 4, 4, 3], modalities [web, chat, chat, web, mcq]
INSERT INTO reviews (id, card_id, bloom_level, rating, question_text, modality, reviewed_at) VALUES
  ('40000000-0000-0000-0000-000000000007', '20000000-0000-0000-0000-000000000006', 0, 3, 'State point-slope form',           'web',  NOW() - INTERVAL '20 days'),
  ('40000000-0000-0000-0000-000000000008', '20000000-0000-0000-0000-000000000006', 1, 3, 'Explain when to use point-slope',  'chat', NOW() - INTERVAL '15 days'),
  ('40000000-0000-0000-0000-000000000009', '20000000-0000-0000-0000-000000000006', 2, 4, 'Convert between forms',            'chat', NOW() - INTERVAL '10 days'),
  ('40000000-0000-0000-0000-000000000010', '20000000-0000-0000-0000-000000000006', 3, 4, 'Evaluate best form for problem',   'web',  NOW() - INTERVAL '5 days'),
  ('40000000-0000-0000-0000-000000000011', '20000000-0000-0000-0000-000000000006', 4, 3, 'Critique solution approach',       'mcq',  NOW() - INTERVAL '3 days');

-- Card 7 (Multiplication): ratings [3, 3, 1], modalities [web, web, web]
INSERT INTO reviews (id, card_id, bloom_level, rating, question_text, modality, reviewed_at) VALUES
  ('40000000-0000-0000-0000-000000000012', '20000000-0000-0000-0000-000000000007', 0, 3, 'What is 8x7?',            'web', NOW() - INTERVAL '7 days'),
  ('40000000-0000-0000-0000-000000000013', '20000000-0000-0000-0000-000000000007', 1, 3, 'Explain multiplication',   'web', NOW() - INTERVAL '4 days'),
  ('40000000-0000-0000-0000-000000000014', '20000000-0000-0000-0000-000000000007', 2, 1, 'Apply to word problem',    'web', NOW() - INTERVAL '1 day');

-- Card 10 (Mitosis): ratings [3, 2], modalities [chat, web]
INSERT INTO reviews (id, card_id, bloom_level, rating, question_text, modality, reviewed_at) VALUES
  ('40000000-0000-0000-0000-000000000015', '20000000-0000-0000-0000-000000000010', 0, 3, 'Name mitosis phases',      'chat', NOW() - INTERVAL '5 days'),
  ('40000000-0000-0000-0000-000000000016', '20000000-0000-0000-0000-000000000010', 1, 2, 'Explain prophase details',  'web',  NOW() - INTERVAL '1 day');

-- Card 11 (DNA replication): ratings [4, 3, 3], modalities [web, web, chat]
INSERT INTO reviews (id, card_id, bloom_level, rating, question_text, modality, reviewed_at) VALUES
  ('40000000-0000-0000-0000-000000000017', '20000000-0000-0000-0000-000000000011', 0, 4, 'Define DNA replication',          'web',  NOW() - INTERVAL '14 days'),
  ('40000000-0000-0000-0000-000000000018', '20000000-0000-0000-0000-000000000011', 1, 3, 'Explain semi-conservative model', 'web',  NOW() - INTERVAL '8 days'),
  ('40000000-0000-0000-0000-000000000019', '20000000-0000-0000-0000-000000000011', 2, 3, 'Compare to RNA transcription',    'chat', NOW() - INTERVAL '7 days');

-- ── Images (2 rows) ────────────────────────────────────────────────────────
-- Actual placeholder image files are created by setup.ts via docker exec

INSERT INTO images (id, card_id, user_id, filename, mime_type) VALUES
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-000000000099', 'cell-diagram.png',  'image/png'),
  ('30000000-0000-0000-0000-000000000002', NULL,                                    '00000000-0000-0000-0000-000000000099', 'standalone.png',    'image/png');

-- ── Cleanup helper function ────────────────────────────────────────────────
DROP FUNCTION IF EXISTS _fake_emb(int);
