import { getInboxNodes } from "@/lib/api";
import InboxList from "./InboxList";

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

  return <InboxList initialNodes={nodes} />;
}
