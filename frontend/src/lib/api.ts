import type { components } from "./api-types";

export type NodeDetail = components["schemas"]["NodeDetail"];
export type NodeSummary = components["schemas"]["NodeSummary"];
export type SuggestPermanentResponse = components["schemas"]["SuggestPermanentResponse"];
export type PermanentCandidate = components["schemas"]["PermanentCandidate"];

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
  patch: { title?: string; content?: string; summary?: string },
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
}): Promise<NodeDetail> {
  return request("/api/v1/nodes/permanent", {
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
