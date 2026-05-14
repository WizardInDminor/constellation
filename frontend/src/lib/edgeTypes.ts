import type { EdgeType } from "@/lib/api";

export const EDGE_TYPES: EdgeType[] = [
  "SUPPORTS",
  "CONTRADICTS",
  "ELABORATES",
  "ANALOGOUS_TO",
  "QUESTIONS",
  "INSPIRED_BY",
  "COLLECTS",
];

export const EDGE_COLORS: Record<EdgeType, string> = {
  SUPPORTS: "bg-green-100 text-green-700",
  CONTRADICTS: "bg-red-100 text-red-700",
  ELABORATES: "bg-blue-100 text-blue-700",
  ANALOGOUS_TO: "bg-purple-100 text-purple-700",
  QUESTIONS: "bg-amber-100 text-amber-700",
  INSPIRED_BY: "bg-pink-100 text-pink-700",
  COLLECTS: "bg-indigo-100 text-indigo-700",
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
};

export function directionGlyph(type: EdgeType): string {
  return EDGE_TYPE_META[type].directional ? "→" : "↔";
}
