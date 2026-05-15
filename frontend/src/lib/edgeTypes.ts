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
};

export function directionGlyph(type: EdgeType): string {
  return EDGE_TYPE_META[type].directional ? "→" : "↔";
}
