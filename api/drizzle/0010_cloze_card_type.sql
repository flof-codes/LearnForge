ALTER TABLE cards ADD COLUMN card_type varchar(20) NOT NULL DEFAULT 'standard';
ALTER TABLE cards ADD COLUMN cloze_data jsonb;
