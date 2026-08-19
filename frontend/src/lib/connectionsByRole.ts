/**
 * Connections-by-role grouping (Phase B, ADR-084).
 *
 * GENERIC knowledge-graph primitive — not a narrative feature. Given a node's
 * edges (each carrying the neighbor's type + tags + story-event flag, now
 * denormalised onto EdgeSummary), bucket the connections by the *role* the
 * neighbor plays. The role taxonomy degrades gracefully:
 *
 *   1. story-event neighbors            → Scenes / Events
 *   2. reserved `narrative:*` tags      → Characters, Symbols, World Rules, …
 *   3. otherwise the node's base type   → Sources, Structures, Notes, …
 *
 * So it is immediately useful for a research corpus ("this paper → Sources,
 * Supporting notes, Open questions") and for a dense narrative world alike.
 *
 * Pure + dependency-free so it unit-tests cleanly (repo convention:
 * filterGraph.ts, filterTimeline.ts).
 */

export type RoleKey =
  | "scenes"
  | "characters"
  | "themes"
  | "symbols"
  | "locations"
  | "factions"
  | "worldRules"
  | "openQuestions"
  | "artifacts"
  | "lore"
  | "structures"
  | "sources"
  | "literature"
  | "notes"
  | "other";

export interface Connection {
  edgeId: string;
  edgeType: string;
  direction: "outgoing" | "incoming";
  note: string | null;
  resolvedAt: string | null;
  resolvedByNodeId: string | null;
  neighbor: { id: string; title: string; type: string };
  neighborTags: string[];
  neighborIsStoryEvent: boolean;
}

export interface RoleGroup {
  key: RoleKey;
  label: string;
  items: Connection[];
}

// Minimal structural shape of the EdgeSummary fields we consume. Kept local so
// the helper doesn't depend on the generated API types (which categorise as
// `any` until `pnpm types` runs against a live backend).
interface EdgeSummaryLike {
  id: string;
  type: string;
  note?: string | null;
  resolved_at?: string | null;
  resolved_by_node_id?: string | null;
  neighbor: { id: string; title: string; type: string };
  neighbor_tags?: { name: string }[];
  neighbor_is_story_event?: boolean;
}

interface NodeDetailLike {
  outgoing_edges?: EdgeSummaryLike[];
  incoming_edges?: EdgeSummaryLike[];
}

export const DEFAULT_ROLE_LABELS: Record<RoleKey, string> = {
  scenes: "Scenes",
  characters: "Characters",
  themes: "Themes",
  symbols: "Symbols",
  locations: "Locations",
  factions: "Factions",
  worldRules: "World Rules",
  openQuestions: "Open Questions",
  artifacts: "Artifacts",
  lore: "Lore",
  structures: "Maps & Structures",
  sources: "Sources",
  literature: "Literature",
  notes: "Notes",
  other: "Other",
};

// Display order. Narrative roles first (they're the densest in a story world),
// then the generic knowledge-system fallbacks.
export const ROLE_ORDER: RoleKey[] = [
  "scenes",
  "characters",
  "themes",
  "symbols",
  "worldRules",
  "openQuestions",
  "locations",
  "factions",
  "artifacts",
  "lore",
  "structures",
  "sources",
  "literature",
  "notes",
  "other",
];

const NARRATIVE_TAG_ROLE: Record<string, RoleKey> = {
  "narrative:character": "characters",
  "narrative:theme": "themes",
  "narrative:symbol": "symbols",
  "narrative:location": "locations",
  "narrative:faction": "factions",
  "narrative:open-question": "openQuestions",
  "narrative:lore-world-rule": "worldRules",
  "narrative:lore-artifact": "artifacts",
};

const TYPE_ROLE: Record<string, RoleKey> = {
  structure: "structures",
  source: "sources",
  literature: "literature",
  permanent: "notes",
  fleeting: "notes",
};

/** Classify one connection into a role bucket. */
export function roleForConnection(c: Connection): RoleKey {
  if (c.neighborIsStoryEvent) return "scenes";

  for (const tag of c.neighborTags) {
    const role = NARRATIVE_TAG_ROLE[tag];
    if (role) return role;
  }
  // Any other lore subtype lands in the generic Lore bucket.
  if (c.neighborTags.some((t) => t.startsWith("narrative:lore-")))
    return "lore";

  return TYPE_ROLE[c.neighbor.type] ?? "other";
}

/** Flatten a NodeDetail's outgoing + incoming edges into Connections. */
export function connectionsFromDetail(detail: NodeDetailLike): Connection[] {
  const map = (
    e: EdgeSummaryLike,
    direction: "outgoing" | "incoming",
  ): Connection => ({
    edgeId: e.id,
    edgeType: e.type,
    direction,
    note: e.note ?? null,
    resolvedAt: e.resolved_at ?? null,
    resolvedByNodeId: e.resolved_by_node_id ?? null,
    neighbor: e.neighbor,
    neighborTags: (e.neighbor_tags ?? []).map((t) => t.name),
    neighborIsStoryEvent: Boolean(e.neighbor_is_story_event),
  });
  return [
    ...(detail.outgoing_edges ?? []).map((e) => map(e, "outgoing")),
    ...(detail.incoming_edges ?? []).map((e) => map(e, "incoming")),
  ];
}

export interface GroupOptions {
  /**
   * Override a bucket's label for the node being viewed. E.g. when the subject
   * is a world-rule/claim, the caller can render its connected scenes as
   * "Demonstrated In" — an evidence relationship, generic across domains.
   */
  labelOverrides?: Partial<Record<RoleKey, string>>;
}

/** Group connections by role, in ROLE_ORDER, dropping empty buckets. */
export function groupConnectionsByRole(
  connections: Connection[],
  opts: GroupOptions = {},
): RoleGroup[] {
  const buckets = new Map<RoleKey, Connection[]>();
  for (const c of connections) {
    const role = roleForConnection(c);
    const list = buckets.get(role) ?? [];
    list.push(c);
    buckets.set(role, list);
  }
  const groups: RoleGroup[] = [];
  for (const key of ROLE_ORDER) {
    const items = buckets.get(key);
    if (!items || items.length === 0) continue;
    groups.push({
      key,
      label: opts.labelOverrides?.[key] ?? DEFAULT_ROLE_LABELS[key],
      items,
    });
  }
  return groups;
}

/**
 * Short human phrase for WHY a connection exists, from the subject node's point
 * of view. Direction-aware so "A SUPPORTS B" reads "supports" on A's page and
 * "supported by" on B's page. Falls back to the raw edge type.
 */
export function connectionReason(c: Connection): string {
  const t = c.edgeType;
  const out = c.direction === "outgoing";
  const phrases: Record<string, [string, string]> = {
    // [outgoing, incoming]
    SUPPORTS: ["supports", "supported by"],
    CONTRADICTS: ["contradicts", "contradicted by"],
    ELABORATES: ["elaborates on", "elaborated by"],
    QUESTIONS: ["questions", "questioned by"],
    EXPLAINS: ["explains", "explained by"],
    COLLECTS: ["collects", "collected by"],
    FOLLOWS_FROM: ["follows from", "precedes"],
    INSPIRED_BY: ["inspired by", "inspires"],
    BUILDS_ON: ["builds on", "built on by"],
    SUPERSEDED_BY: ["superseded by", "supersedes"],
  };
  const pair = phrases[t];
  const base = pair
    ? out
      ? pair[0]
      : pair[1]
    : t.toLowerCase().replace(/_/g, " ");
  if (c.resolvedAt) return `${base} · resolved`;
  return base;
}
