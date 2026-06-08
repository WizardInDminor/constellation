"use client";

import { useState } from "react";
import Link from "next/link";
import { deleteNode } from "@/lib/api";
import type { NodeSummary } from "@/lib/api";
import { timeAgo, formatAbsolute } from "./timeFormat";

function InboxCard({
  node,
  onDiscard,
}: {
  node: NodeSummary;
  onDiscard: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [discarding, setDiscarding] = useState(false);

  async function handleDiscard() {
    setDiscarding(true);
    try {
      await deleteNode(node.id);
      onDiscard();
    } catch {
      setDiscarding(false);
      setConfirming(false);
    }
  }

  return (
    <li className="card flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-medium text-gray-900">
          {node.title}
        </span>
        <time
          dateTime={node.created_at}
          title={formatAbsolute(node.created_at)}
          className="w-fit cursor-help text-xs text-gray-400"
        >
          {timeAgo(node.created_at)}
        </time>
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
        {confirming ? (
          <>
            <span className="text-xs text-gray-500">Discard this note?</span>
            <button
              type="button"
              onClick={handleDiscard}
              disabled={discarding}
              className="btn btn-danger btn-sm"
            >
              {discarding ? "Discarding…" : "Yes, discard"}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={discarding}
              className="btn btn-ghost btn-sm"
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="btn btn-ghost btn-sm"
            >
              Discard
            </button>
            <Link href={`/nodes/${node.id}`} className="btn btn-ghost btn-sm">
              Edit
            </Link>
            <Link
              href={`/inbox/process/${node.id}`}
              className="btn btn-primary btn-sm"
            >
              Process →
            </Link>
          </>
        )}
      </div>
    </li>
  );
}

export default function InboxList({
  initialNodes,
}: {
  initialNodes: NodeSummary[];
}) {
  const [nodes, setNodes] = useState(initialNodes);

  function handleDiscard(id: string) {
    setNodes((prev) => prev.filter((n) => n.id !== id));
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="page-title">Inbox</h1>
        {nodes.length > 0 && (
          <span className="text-sm text-gray-500">
            {nodes.length} note{nodes.length !== 1 ? "s" : ""} to process
          </span>
        )}
      </div>

      {nodes.length === 0 ? (
        <div className="empty-state">
          <p className="text-sm font-medium text-gray-700">Inbox zero</p>
          <p className="max-w-sm text-sm text-gray-500">
            No fleeting notes waiting to be processed. Capture a thought and it
            will land here, ready to be turned into a permanent note.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {nodes.map((node) => (
            <InboxCard
              key={node.id}
              node={node}
              onDiscard={() => handleDiscard(node.id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
