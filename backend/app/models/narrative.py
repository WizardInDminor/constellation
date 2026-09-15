"""Reserved narrative role vocabulary — the single authoritative module
(Phase C2; ADR-086 consequence).

Roles are tags, not node types (ADR-065 consequences, ADR-086): a character
is any node carrying `narrative:character`, whatever its NodeType. Everything
that reads or writes role tags — scene context assembly (timeline_repo),
proposal acceptance (proposal_service), context builders, and later MCP
tools — imports from here so the vocabulary cannot drift.
"""

NARRATIVE_TAG_CHARACTER = "narrative:character"
NARRATIVE_TAG_THEME = "narrative:theme"
NARRATIVE_TAG_LOCATION = "narrative:location"
NARRATIVE_TAG_LORE_PREFIX = "narrative:lore-"  # narrative:lore-world-rule, etc.
NARRATIVE_TAG_WORLD_RULE = "narrative:lore-world-rule"

# proposal_type -> role tag applied at acceptance (None = no role tag).
PROPOSAL_ROLE_TAGS: dict[str, str | None] = {
    "scene": None,  # becomes a story-event node, no role tag
    "character": NARRATIVE_TAG_CHARACTER,
    "theme": NARRATIVE_TAG_THEME,
    "location": NARRATIVE_TAG_LOCATION,
    "world_rule": NARRATIVE_TAG_WORLD_RULE,
    "development_note": None,
    "general": None,
}
