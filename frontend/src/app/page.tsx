import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-6 text-center">
      <h1 className="text-3xl font-bold text-gray-900">Constellation</h1>
      <p className="text-gray-500 max-w-sm">
        Press{" "}
        <kbd className="bg-white border border-gray-200 shadow-sm px-1.5 py-0.5 rounded text-sm font-mono">
          Ctrl+K
        </kbd>{" "}
        to capture a thought. Then process it from the inbox.
      </p>
      <Link href="/inbox" className="text-sm text-indigo-600 hover:text-indigo-800 underline">
        Open inbox →
      </Link>
    </div>
  );
}
