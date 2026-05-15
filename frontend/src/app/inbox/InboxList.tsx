"use client";

import { useState } from "react";
import Link from "next/link";
import { deleteNode } from "@/lib/api";
import type { NodeSummary } from "@/lib/api";
import { timeAgo, formatAbsolute } from "./timeFormat";

function InboxCard({ node, onDiscard }: { node: NodeSummary; onDiscard: () => void }) {
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
    <li className="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-4 py-3">
      <div className="flex flex-col">
        <span className="font-medium text-sm">{node.title}</span>
        <time
          dateTime={node.created_at}
          title={formatAbsolute(node.created_at)}
          className="text-xs text-gray-400 cursor-help w-fit"
        >
          {timeAgo(node.created_at)}
        </time>
      </div>
      <div className="flex items-center gap-4">
        {confirming ? (
          <>
            <span className="text-xs text-gray-500">Discard this note?</span>
            <button
              onClick={handleDiscard}
              disabled={discarding}
              className="text-sm text-red-600 hover:text-red-800 font-medium disabled:opacity-50"
            >
              {discarding ? "Discarding…" : "Yes, discard"}
            </button>
            <button
              onClick={() => setConfirming(false)}
              disabled={discarding}
              className="text-sm text-gray-400 hover:text-gray-700"
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => setConfirming(true)}
              className="text-sm text-gray-400 hover:text-red-500"
            >
              Discard
            </button>
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
          </>
        )}
      </div>
    </li>
  );
}

export default function InboxList({ initialNodes }: { initialNodes: NodeSummary[] }) {
  const [nodes, setNodes] = useState(initialNodes);

  function handleDiscard(id: string) {
    setNodes((prev) => prev.filter((n) => n.id !== id));
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
