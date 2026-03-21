-- Migration: Switch embedding model from all-MiniLM-L6-v2 (384d) to bge-m3 (1024d)
-- Widen vector column and clear stale embeddings for backfill

UPDATE cards SET embedding = NULL;
ALTER TABLE cards ALTER COLUMN embedding TYPE vector(1024);
