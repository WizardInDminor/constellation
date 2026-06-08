import { getInboxNodes } from "@/lib/api";
import InboxList from "./InboxList";

export default async function InboxPage() {
  let nodes;
  try {
    nodes = await getInboxNodes();
  } catch {
    return (
      <div className="alert-error">
        Could not reach the backend. Is it running?
      </div>
    );
  }

  return <InboxList initialNodes={nodes} />;
}
