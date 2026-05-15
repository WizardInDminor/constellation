-- Persist the bridge classifier's rationale on the edge it produced. Distinct
-- from the user-authored `note`: the rationale is the model's justification at
-- the moment of Apply, frozen for future re-encounter. NULL for edges that
-- were created by hand or pre-date this column.

ALTER TABLE edges ADD COLUMN classifier_rationale TEXT;
