import type { NodeUsed } from "./api";

/** Replace `[Note N]` tokens in a RAG answer with markdown links to each cited node. */
export function resolveCitations(answer: string, provenance: NodeUsed[]): string {
  return answer.replace(/\[Note (\d+)\]/g, (match, numStr) => {
    const idx = parseInt(numStr, 10) - 1;
    const node = provenance[idx];
    if (!node) return match;
    return `[Note ${numStr}](/nodes/${node.node_id})`;
  });
}
