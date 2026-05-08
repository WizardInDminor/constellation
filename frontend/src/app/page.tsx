const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function getHealth(): Promise<{ status: string } | null> {
  try {
    const res = await fetch(`${API_URL}/health`, { cache: "no-store" });
    return res.json();
  } catch {
    return null;
  }
}

export default async function Home() {
  const health = await getHealth();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <h1 className="mb-6 text-3xl font-bold tracking-tight">Constellation</h1>
      <div className="rounded-lg border px-6 py-4 text-sm">
        <span className="font-medium">Backend: </span>
        {health ? (
          <span className="text-green-600">{health.status}</span>
        ) : (
          <span className="text-red-500">unreachable</span>
        )}
      </div>
    </main>
  );
}
