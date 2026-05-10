export const NODE_COLORS: Record<string, string> = {
  fleeting: "#F59E0B",
  literature: "#0EA5E9",
  permanent: "#10B981",
  structure: "#8B5CF6",
  source: "#0F766E",
};

export const EDGE_COLORS: Record<string, string> = {
  SUPPORTS: "#22C55E",
  CONTRADICTS: "#EF4444",
  ELABORATES: "#3B82F6",
  ANALOGOUS_TO: "#A855F7",
  QUESTIONS: "#F97316",
  INSPIRED_BY: "#EC4899",
  COLLECTS: "#94A3B8",
  CITES: "#0F766E",
};

export function nodeColor(type: string): string {
  return NODE_COLORS[type] ?? "#9CA3AF";
}

export function edgeColor(type: string): string {
  return EDGE_COLORS[type] ?? "#9CA3AF";
}
