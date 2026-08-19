/**
 * Typed timeline layers (Phase B, ADR-085).
 *
 * A timeline lane's "kind" is carried by a reserved `layer:<kind>` tag on its
 * structure node (surfaced as `TimelineLane.timeline_tags`). This module is the
 * pure resolver + metadata + kind-filter used by TimelinePanel to colour,
 * label, and filter lanes by type. Generic: the kind set is open — unknown
 * kinds render with a title-cased label and a neutral colour.
 */

export const LAYER_PREFIX = "layer:";

export interface LaneLike {
  timeline_tags?: { name: string }[] | null;
}

export interface LayerMeta {
  label: string;
  color: string; // hex, for SVG / inline
  swatch: string; // tailwind bg-* for chips
}

// Seed kinds (extensible). Distinct colours so lanes are visually separable.
export const LAYER_KIND_META: Record<string, LayerMeta> = {
  external: { label: "External", color: "#3b82f6", swatch: "bg-blue-500" },
  historical: { label: "Historical", color: "#a97830", swatch: "bg-amber-700" },
  dream: { label: "Dream", color: "#a855f7", swatch: "bg-purple-500" },
  metaphysical: {
    label: "Metaphysical",
    color: "#ec4899",
    swatch: "bg-pink-500",
  },
  "character-arc": {
    label: "Character Arc",
    color: "#10b981",
    swatch: "bg-emerald-500",
  },
  "theme-arc": { label: "Theme Arc", color: "#f59e0b", swatch: "bg-amber-500" },
  unspecified: {
    label: "Unspecified",
    color: "#9ca3af",
    swatch: "bg-gray-400",
  },
};

function titleCase(s: string): string {
  return s
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(" ");
}

/** The lane's kind, from its first `layer:*` tag. "unspecified" if none. */
export function layerKindForLane(lane: LaneLike): string {
  const tag = (lane.timeline_tags ?? [])
    .map((t) => t.name)
    .find((n) => n.startsWith(LAYER_PREFIX));
  if (!tag) return "unspecified";
  const kind = tag.slice(LAYER_PREFIX.length).trim();
  return kind || "unspecified";
}

/** Display metadata for a kind, with a sane fallback for unknown kinds. */
export function layerMeta(kind: string): LayerMeta {
  return (
    LAYER_KIND_META[kind] ?? {
      label: titleCase(kind),
      color: "#9ca3af",
      swatch: "bg-gray-400",
    }
  );
}

/** Distinct kinds present across the given lanes, in first-seen order. */
export function distinctLayerKinds(lanes: LaneLike[]): string[] {
  const seen: string[] = [];
  for (const l of lanes) {
    const k = layerKindForLane(l);
    if (!seen.includes(k)) seen.push(k);
  }
  return seen;
}

/** Lanes whose kind is not in `hiddenKinds`. */
export function visibleByKind<T extends LaneLike>(
  lanes: T[],
  hiddenKinds: Set<string>,
): T[] {
  if (hiddenKinds.size === 0) return lanes;
  return lanes.filter((l) => !hiddenKinds.has(layerKindForLane(l)));
}
