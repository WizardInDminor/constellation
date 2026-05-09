import type { components } from "./api-types";

export type NodeDetail = components["schemas"]["NodeDetail"];
export type NodeSummary = components["schemas"]["NodeSummary"];
export type NodeRef = components["schemas"]["NodeRef"];
export type SuggestPermanentResponse = components["schemas"]["SuggestPermanentResponse"];
export type PermanentCandidate = components["schemas"]["PermanentCandidate"];
export type SuggestLinksResponse = components["schemas"]["SuggestLinksResponse"];
export type LinkSuggestion = components["schemas"]["LinkSuggestion"];
export type PaginatedNodes = components["schemas"]["Paginated_NodeSummary_"];
export type TagRef = components["schemas"]["TagRef"];
export type EdgeDetail = components["schemas"]["EdgeDetail"];
export type EdgeType = components["schemas"]["EdgeCreate"]["type"];
export type SourceSummary = components["schemas"]["SourceSummary"];
export type SourceDetail = components["schemas"]["SourceDetail"];
export type SourceCreate = components["schemas"]["SourceCreate"];
export type SearchResponse = components["schemas"]["SearchResponse"];
export type SearchResult = components["schemas"]["SearchResult"];
export type RagResponse = components["schemas"]["RagResponse"];
export type NodeUsed = components["schemas"]["NodeUsed"];
export type EdgeTraversed = components["schemas"]["EdgeTraversed"];

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    ...options,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status}: ${text}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export function createFleetingNode(title: string, content: string): Promise<NodeDetail> {
  return request("/api/v1/nodes/fleeting", {
    method: "POST",
    body: JSON.stringify({ title, content }),
  });
}

export function getInboxNodes(): Promise<NodeSummary[]> {
  return request("/api/v1/nodes/inbox");
}

export function getNode(id: string): Promise<NodeDetail> {
  return request(`/api/v1/nodes/${id}`);
}

export function updateNode(
  id: string,
  patch: { title?: string; content?: string; summary?: string; tag_ids?: string[] | null },
): Promise<NodeDetail> {
  return request(`/api/v1/nodes/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export function markNodeProcessed(id: string): Promise<NodeDetail> {
  return request(`/api/v1/nodes/${id}/process`, { method: "POST" });
}

export function suggestPermanent(id: string): Promise<SuggestPermanentResponse> {
  return request(`/api/v1/rag/suggest-permanent/${id}`, { method: "POST" });
}

export function createPermanentNode(data: {
  title: string;
  content: string;
  summary?: string;
  tag_ids?: string[];
}): Promise<NodeDetail> {
  return request("/api/v1/nodes/permanent", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function listNodes(type?: string, page = 1): Promise<PaginatedNodes> {
  const params = new URLSearchParams({ page: String(page), page_size: "50" });
  if (type) params.set("type", type);
  return request(`/api/v1/nodes?${params}`);
}

export function createLiteratureNode(data: {
  title: string;
  content: string;
  summary?: string;
  source_id: string;
  tag_ids?: string[];
}): Promise<NodeDetail> {
  return request("/api/v1/nodes/literature", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function createStructureNode(data: {
  title: string;
  content: string;
  summary?: string;
}): Promise<NodeDetail> {
  return request("/api/v1/nodes/structure", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function searchNodes(q: string, limit = 10): Promise<NodeRef[]> {
  const params = new URLSearchParams({ q, limit: String(limit) });
  return request(`/api/v1/nodes/search?${params}`);
}

// Tags
export function listTags(): Promise<TagRef[]> {
  return request("/api/v1/tags");
}

export function createTag(name: string, color?: string): Promise<TagRef> {
  return request("/api/v1/tags", {
    method: "POST",
    body: JSON.stringify({ name, color }),
  });
}

// Edges
export function createEdge(data: {
  from_id: string;
  to_id: string;
  type: EdgeType;
  note?: string;
}): Promise<EdgeDetail> {
  return request("/api/v1/edges", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function deleteEdge(edgeId: string): Promise<void> {
  return request(`/api/v1/edges/${edgeId}`, { method: "DELETE" });
}

// RAG
export function suggestLinks(nodeId: string): Promise<SuggestLinksResponse> {
  return request(`/api/v1/rag/suggest-links/${nodeId}`, { method: "POST" });
}

// Sources
export function listSources(): Promise<SourceSummary[]> {
  return request("/api/v1/sources");
}

export function getSource(id: string): Promise<SourceDetail> {
  return request(`/api/v1/sources/${id}`);
}

export function createSource(data: Omit<SourceCreate, "id">): Promise<SourceDetail> {
  return request("/api/v1/sources", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function openSource(id: string): Promise<{ opened: string }> {
  return request(`/api/v1/sources/${id}/open`);
}

// Search
export function searchSemantic(query: string, limit = 20): Promise<SearchResponse> {
  return request("/api/v1/search/semantic", {
    method: "POST",
    body: JSON.stringify({ query, limit }),
  });
}

export function searchFulltext(query: string, limit = 20): Promise<SearchResponse> {
  return request("/api/v1/search/fulltext", {
    method: "POST",
    body: JSON.stringify({ query, limit }),
  });
}

export function searchHybrid(query: string, limit = 20): Promise<SearchResponse> {
  return request("/api/v1/search/hybrid", {
    method: "POST",
    body: JSON.stringify({ query, limit }),
  });
}

// RAG
export function ragQuery(query: string, depth = 1): Promise<RagResponse> {
  return request("/api/v1/rag/query", {
    method: "POST",
    body: JSON.stringify({ query, depth }),
  });
}
