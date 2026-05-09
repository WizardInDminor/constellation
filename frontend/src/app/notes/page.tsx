import Link from "next/link";
import { listNodes } from "@/lib/api";
import type { NodeSummary, TagRef } from "@/lib/api";

const TYPE_LABELS: Record<string, string> = {
  permanent: "permanent",
  structure: "structure",
  literature: "literature",
};

const TYPE_COLORS: Record<string, string> = {
  permanent: "bg-green-100 text-green-700",
  structure: "bg-purple-100 text-purple-700",
  literature: "bg-blue-100 text-blue-700",
};

function TagChip({ tag }: { tag: TagRef }) {
  return (
    <span
      className="text-xs px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500"
      style={tag.color ? { backgroundColor: tag.color + "33", color: tag.color } : undefined}
    >
      {tag.name}
    </span>
  );
}

function NoteCard({ node }: { node: NodeSummary }) {
  return (
    <li>
      <Link
        href={`/nodes/${node.id}`}
        className="flex items-start justify-between bg-white border border-gray-200 rounded-lg px-4 py-3 hover:border-indigo-300 hover:shadow-sm transition-all"
      >
        <div className="flex flex-col gap-1 min-w-0 pr-4">
          <span className="font-medium text-sm truncate">{node.title}</span>
          {node.summary && (
            <span className="text-xs text-gray-500 line-clamp-2">{node.summary}</span>
          )}
          {node.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-0.5">
              {node.tags.map((t) => <TagChip key={t.id} tag={t} />)}
            </div>
          )}
        </div>
        <span
          className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 mt-0.5 ${TYPE_COLORS[node.type] ?? "bg-gray-100 text-gray-600"}`}
        >
          {TYPE_LABELS[node.type] ?? node.type}
        </span>
      </Link>
    </li>
  );
}

export default async function NotesPage() {
  let permanent, structure;
  try {
    [permanent, structure] = await Promise.all([
      listNodes("permanent"),
      listNodes("structure"),
    ]);
  } catch {
    return (
      <div className="text-red-600 text-sm">Could not reach the backend. Is it running?</div>
    );
  }

  const allNotes = [...permanent.items, ...structure.items].sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Notes</h2>
        <span className="text-sm text-gray-500">{allNotes.length} saved</span>
      </div>

      {allNotes.length === 0 ? (
        <p className="text-gray-400 text-sm">
          No permanent or structure notes yet. Process some inbox notes to get started.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {allNotes.map((node) => (
            <NoteCard key={node.id} node={node} />
          ))}
        </ul>
      )}
    </div>
  );
}
