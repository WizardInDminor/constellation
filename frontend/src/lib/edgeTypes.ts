import type { EdgeType } from "@/lib/api";

export const EDGE_TYPES: EdgeType[] = [
  // Author-stance verbs.
  "SUPPORTS",
  "CONTRADICTS",
  "ELABORATES",
  "ANALOGOUS_TO",
  "QUESTIONS",
  "INSPIRED_BY",
  // Structural verbs.
  "COLLECTS",
  "CITES",
  // Literature-stance verbs (ADR-052).
  "BUILDS_ON",
  "APPLIES_TO",
  "MEASURES",
  "EXTENDS",
  "REFINES",
  // Evolution / D1 verbs (ADR-060). RESOLVES intentionally absent (ADR-059).
  "SUPERSEDED_BY",
  "SCOPED_TO",
  "REGIME_OF",
  "FOLLOWS_FROM",
  // Narrative (ADR-052 Slice 4 addendum).
  "EXPLAINS",
  // Canon symbolic / resonance verbs (ADR-074).
  "HOLDS_OPEN",
  "REFUSES_TO_NAME",
  "CARRIES_CHARGE_FOR",
  "FORESHADOWS",
  "MIRRORS",
  "INVERSION_OF",
  "PROTOTYPE_OF",
  "AMPLIFIES",
  "CORRUPTS",
  "DESTABILIZES",
  "STABILIZES",
  "PROTECTS",
  "THREATENS",
];

// Tension-bearing edge types — the only types on which the "mark resolved"
// action is offered. Mirrors backend `RESOLVABLE_EDGE_TYPES` (ADR-059).
export const RESOLVABLE_EDGE_TYPES: ReadonlySet<EdgeType> = new Set<EdgeType>([
  "CONTRADICTS",
  "QUESTIONS",
]);

export const EDGE_COLORS: Record<EdgeType, string> = {
  SUPPORTS: "bg-green-100 text-green-700",
  CONTRADICTS: "bg-red-100 text-red-700",
  ELABORATES: "bg-blue-100 text-blue-700",
  ANALOGOUS_TO: "bg-purple-100 text-purple-700",
  QUESTIONS: "bg-amber-100 text-amber-700",
  INSPIRED_BY: "bg-pink-100 text-pink-700",
  COLLECTS: "bg-indigo-100 text-indigo-700",
  CITES: "bg-teal-100 text-teal-700",
  BUILDS_ON: "bg-orange-100 text-orange-700",
  APPLIES_TO: "bg-yellow-100 text-yellow-700",
  MEASURES: "bg-cyan-100 text-cyan-700",
  EXTENDS: "bg-emerald-100 text-emerald-700",
  REFINES: "bg-slate-100 text-slate-700",
  SUPERSEDED_BY: "bg-rose-100 text-rose-700",
  SCOPED_TO: "bg-sky-100 text-sky-700",
  REGIME_OF: "bg-fuchsia-100 text-fuchsia-700",
  FOLLOWS_FROM: "bg-lime-100 text-lime-700",
  EXPLAINS: "bg-amber-100 text-amber-800",
  // Canon symbolic / resonance verbs (ADR-074).
  HOLDS_OPEN: "bg-violet-100 text-violet-700",
  REFUSES_TO_NAME: "bg-stone-100 text-stone-700",
  CARRIES_CHARGE_FOR: "bg-red-100 text-red-800",
  FORESHADOWS: "bg-indigo-100 text-indigo-800",
  MIRRORS: "bg-purple-100 text-purple-800",
  INVERSION_OF: "bg-fuchsia-100 text-fuchsia-800",
  PROTOTYPE_OF: "bg-teal-100 text-teal-800",
  AMPLIFIES: "bg-orange-100 text-orange-800",
  CORRUPTS: "bg-rose-100 text-rose-800",
  DESTABILIZES: "bg-red-100 text-red-700",
  STABILIZES: "bg-green-100 text-green-800",
  PROTECTS: "bg-emerald-100 text-emerald-800",
  THREATENS: "bg-red-200 text-red-900",
};

export interface EdgeTypeMeta {
  label: string;
  directional: boolean;
  description: string;
  example: string;
}

export const EDGE_TYPE_META: Record<EdgeType, EdgeTypeMeta> = {
  SUPPORTS: {
    label: "Supports",
    directional: true,
    description: "A provides evidence or argument for B.",
    example: "Use when this note backs up a claim made in the other note.",
  },
  CONTRADICTS: {
    label: "Contradicts",
    directional: true,
    description: "A is in tension with B.",
    example: "Use when this note challenges or undermines the other note.",
  },
  ELABORATES: {
    label: "Elaborates",
    directional: true,
    description: "A zooms in on an aspect of B.",
    example: "Use when this note adds detail or nuance to a broader idea in the other note.",
  },
  ANALOGOUS_TO: {
    label: "Analogous to",
    directional: false,
    description: "A and B share structural similarity, often across domains.",
    example: "Use when two ideas mirror each other even though they come from different fields.",
  },
  QUESTIONS: {
    label: "Questions",
    directional: true,
    description: "A raises a problem with or about B.",
    example: "Use when this note interrogates an assumption in the other note.",
  },
  INSPIRED_BY: {
    label: "Inspired by",
    directional: true,
    description: "A is a looser creative or associative link from B.",
    example: "Use when the other note sparked this one but isn't strictly evidence for it.",
  },
  COLLECTS: {
    label: "Collects",
    directional: true,
    description: "A (a structure note) includes B in its map.",
    example: "Use from a structure / MOC note that organises the other note.",
  },
  CITES: {
    label: "Cites",
    directional: true,
    description: "A references B as a specific reference, footnote-shaped.",
    example: "Use when this note (often a synthesis) points at the other as one of its sources.",
  },
  BUILDS_ON: {
    label: "Builds on",
    directional: true,
    description: "A advances or extends B's framework.",
    example: "Use when this note picks up where the other left off and develops it further.",
  },
  APPLIES_TO: {
    label: "Applies to",
    directional: true,
    description: "A applies B's idea to a new domain or instance.",
    example: "Use when this note takes the other's concept and uses it in a different context.",
  },
  MEASURES: {
    label: "Measures",
    directional: true,
    description: "A is an empirical measurement of B's claim or quantity.",
    example: "Use when this note records a measurement that tests the other note's claim.",
  },
  EXTENDS: {
    label: "Extends",
    directional: true,
    description: "A adds scope or generality to B (dimension-ward rather than depth-ward).",
    example: "Use when this note broadens the conditions under which the other note's idea holds.",
  },
  REFINES: {
    label: "Refines",
    directional: true,
    description: "A sharpens or specializes B without contradicting it.",
    example: "Use when this note narrows or qualifies the other note without disagreeing.",
  },
  SUPERSEDED_BY: {
    label: "Superseded by",
    directional: true,
    description: "A has been replaced or outdated by B; the current view lives in B.",
    example: "Use when your thinking has moved on from this note to a later one.",
  },
  SCOPED_TO: {
    label: "Scoped to",
    directional: true,
    description: "A applies only within the scope or boundary established by B.",
    example: "Use when this note's claim or method is valid only inside the other note's regime or domain.",
  },
  REGIME_OF: {
    label: "Regime of",
    directional: true,
    description: "A defines the regime or frame under which B is meaningful.",
    example: "Use when this note sets the operative conditions or assumptions that the other note depends on.",
  },
  FOLLOWS_FROM: {
    label: "Follows from",
    directional: true,
    description: "A follows from B causally, logically, or temporally.",
    example: "Use for sequencing: when this note is a consequence of, or comes after, the other.",
  },
  EXPLAINS: {
    label: "Explains",
    directional: true,
    description: "A (lore) provides backdrop/history/cause that explains B (character/location/event).",
    example:
      "Use from a lore note to a character whose behavior the lore makes sense of, or to a location whose atmosphere the lore underwrites.",
  },
  // Canon symbolic / resonance verbs (ADR-074). Nuance lives in the edge note.
  HOLDS_OPEN: {
    label: "Holds open",
    directional: true,
    description: "A sustains B's openness / unresolvedness rather than closing or naming it.",
    example: "Michael → HOLDS_OPEN → Final Shared Moment: he preserves the channel, he doesn't project truth.",
  },
  REFUSES_TO_NAME: {
    label: "Refuses to name",
    directional: true,
    description: "A deliberately withholds a name/definition from B, keeping it load-bearing.",
    example: "Use when a character or scene declines to pin down a mystery that must stay unnamed.",
  },
  CARRIES_CHARGE_FOR: {
    label: "Carries charge for",
    directional: true,
    description: "A holds emotional/symbolic charge on behalf of B.",
    example: "Use from a charged image to the theme or character it electrifies.",
  },
  FORESHADOWS: {
    label: "Foreshadows",
    directional: true,
    description: "A plants or anticipates what B later pays off.",
    example: "Use from an early image/scene to the later moment it prefigures.",
  },
  MIRRORS: {
    label: "Mirrors",
    directional: false,
    description: "A and B reflect each other — parallel structure, inverted or echoed.",
    example: "Use between two scenes or images that rhyme across the story.",
  },
  INVERSION_OF: {
    label: "Inversion of",
    directional: false,
    description: "A is the inverse/negative of B — same shape, opposite valence.",
    example: "Use between a symbol and its dark counterpart (natural light / artificial light).",
  },
  PROTOTYPE_OF: {
    label: "Prototype of",
    directional: true,
    description: "A is an early/partial version that B fully realizes.",
    example: "The Clearing → PROTOTYPE_OF → Final Shared Moment: the first, smaller instance of the later thing.",
  },
  AMPLIFIES: {
    label: "Amplifies",
    directional: true,
    description: "A intensifies or magnifies B.",
    example: "Use when a force, character, or image turns up the intensity of another.",
  },
  CORRUPTS: {
    label: "Corrupts",
    directional: true,
    description: "A degrades, distorts, or colonizes B.",
    example: "Use when a regime or force spoils something that was whole.",
  },
  DESTABILIZES: {
    label: "Destabilizes",
    directional: true,
    description: "A undermines the stability of B.",
    example: "Use when an event or force pushes a state toward collapse.",
  },
  STABILIZES: {
    label: "Stabilizes",
    directional: true,
    description: "A holds B steady against collapse or drift.",
    example: "Use when a character or rule keeps a fragile state intact.",
  },
  PROTECTS: {
    label: "Protects",
    directional: true,
    description: "A shields or guards B.",
    example: "Use when a character or force defends something vulnerable.",
  },
  THREATENS: {
    label: "Threatens",
    directional: true,
    description: "A endangers or menaces B.",
    example: "Use when a force, institution, or character imperils another node.",
  },
};

export function directionGlyph(type: EdgeType): string {
  return EDGE_TYPE_META[type].directional ? "→" : "↔";
}
