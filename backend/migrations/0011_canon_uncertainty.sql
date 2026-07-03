-- Canon readiness Phase 1: uncertainty metadata on nodes (ADR-076).
--
-- Canon (the trilogy this schema addition supports) treats "not yet knowing"
-- as a first-class state: an image can carry charge before it has a scene, a
-- truth can be emerging before it is canon, a mystery can be deliberately held
-- open. The existing schema had nowhere to record that except prose, so it
-- could not be filtered, browsed, or fed to the AI as structured signal. These
-- columns fix that without adding node types (ADR-006 preserved) — they extend
-- the flag/enum pattern already established by `is_story_event` (0007) and
-- `prose_status` (0010).
--
-- All additions are pure, nullable column-adds (plus one boolean flag with a
-- default). SQLite CHECK constraints only evaluate on non-NULL values, so
-- pre-existing rows pass without backfill and behave exactly as before. No
-- CHECK-constraint table-recreate ceremony is required.

-- ================================================================
-- NODES: uncertainty / canon-status columns (ADR-076)
-- ================================================================

-- canon_status — where a node sits on the fixed↔speculative axis.
--   canon       : settled, load-bearing fact of the world
--   provisional : currently developing as true; may still change
--   speculative : a possibility being explored; not committed
--   discarded   : considered and set aside (kept, not deleted — see ADR-009)
--   image_only  : a charged image with no assigned meaning yet
ALTER TABLE nodes ADD COLUMN canon_status TEXT
    CHECK(canon_status IN ('canon', 'provisional', 'speculative', 'discarded', 'image_only'));

-- node_status — the development lifecycle of the idea itself.
--   emerging     : just surfaced; taking shape
--   stable       : settled enough to build on
--   contradicted : in active tension with something else
--   retired      : no longer in play
--   unresolved   : an open question / knot the author is sitting with
ALTER TABLE nodes ADD COLUMN node_status TEXT
    CHECK(node_status IN ('emerging', 'stable', 'contradicted', 'retired', 'unresolved'));

-- charge — emotional / symbolic energy the node carries. The "goosebump" tier
-- is deliberately named after the felt-sense signal the author uses to mark the
-- highest-charge material.
ALTER TABLE nodes ADD COLUMN charge TEXT
    CHECK(charge IN ('low', 'medium', 'high', 'goosebump'));

-- do_not_name_yet — a protected flag. When set, the idea is load-bearing
-- precisely because it is unresolved; naming/overdefining it now would collapse
-- it. Mirrors the boolean-flag pattern of `is_story_event`.
ALTER TABLE nodes ADD COLUMN do_not_name_yet INTEGER NOT NULL DEFAULT 0;

-- confidence — optional 0–100 percentage of how settled the author feels about
-- the node. Nullable: absence means "unrated", which is distinct from low
-- confidence. Kept as a small integer rather than an enum so ranges are
-- queryable (e.g. "everything under 40").
ALTER TABLE nodes ADD COLUMN confidence INTEGER
    CHECK(confidence IS NULL OR (confidence >= 0 AND confidence <= 100));

-- ================================================================
-- INDEXES for the common Canon filters
-- ================================================================
-- Partial indexes keyed on the non-NULL / set states keep each index tiny
-- (these fields are NULL/0 for the vast majority of research nodes) while
-- making the Canon saved-views single indexed scans. Pattern mirrors
-- idx_nodes_story_event (0010) and idx_nodes_project_hub (0007).

CREATE INDEX idx_nodes_canon_status
    ON nodes(canon_status)
    WHERE canon_status IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX idx_nodes_node_status
    ON nodes(node_status)
    WHERE node_status IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX idx_nodes_charge
    ON nodes(charge)
    WHERE charge IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX idx_nodes_do_not_name_yet
    ON nodes(do_not_name_yet)
    WHERE do_not_name_yet = 1 AND deleted_at IS NULL;
