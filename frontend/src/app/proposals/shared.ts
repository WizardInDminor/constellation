// Shared bits for the proposal inbox + detail pages (Track C, ADR-084).

export const STATUS_BADGE: Record<string, string> = {
  captured: "bg-gray-100 text-gray-600",
  proposed: "bg-sky-100 text-sky-800",
  under_review: "bg-amber-100 text-amber-800",
  accepted: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-700",
  superseded: "bg-violet-100 text-violet-800",
  archived: "bg-gray-200 text-gray-500",
};
