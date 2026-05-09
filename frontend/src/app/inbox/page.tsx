import Link from "next/link";
import { getInboxNodes } from "@/lib/api";

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default async function InboxPage() {
  let nodes;
  try {
    nodes = await getInboxNodes();
  } catch {
    return (
      <div className="text-red-600 text-sm">
        Could not reach the backend. Is it running?
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Inbox</h2>
        {nodes.length > 0 && (
          <span className="text-sm text-gray-500">
            {nodes.length} note{nodes.length !== 1 ? "s" : ""} to process
          </span>
        )}
      </div>

      {nodes.length === 0 ? (
        <p className="text-gray-400 text-sm">Nothing to process.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {nodes.map((node) => (
            <li
              key={node.id}
              className="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-4 py-3"
            >
              <div className="flex flex-col">
                <span className="font-medium text-sm">{node.title}</span>
                <span className="text-xs text-gray-400">{timeAgo(node.created_at)}</span>
              </div>
              <div className="flex items-center gap-4">
                <Link
                  href={`/nodes/${node.id}`}
                  className="text-sm text-gray-400 hover:text-gray-700"
                >
                  Edit
                </Link>
                <Link
                  href={`/inbox/process/${node.id}`}
                  className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
                >
                  Process →
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
