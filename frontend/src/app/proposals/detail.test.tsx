// Phase C3 — proposal detail review surface (AT-031 provenance, AT-032 edit,
// accept/reject actions).
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProposalDetail } from "@/lib/api";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "prop-1" }),
  useRouter: () => ({ push }),
}));

vi.mock("@/lib/api", () => ({
  getProposal: vi.fn(),
  transitionProposal: vi.fn(),
  updateProposal: vi.fn(),
}));

// Keep the render light: markdown/mermaid pipelines are out of scope here.
vi.mock("@/components/NoteContent", () => ({
  NoteContent: ({ content }: { content: string }) => <div>{content}</div>,
}));
vi.mock("@/components/MarkdownTextarea", () => ({
  MarkdownTextarea: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => (
    <textarea {...props} />
  ),
}));

import { getProposal, transitionProposal, updateProposal } from "@/lib/api";
import ProposalDetailPage from "./[id]/page";

const detail: ProposalDetail = {
  id: "prop-1",
  project_hub_id: "hub-1",
  proposal_type: "scene",
  title: "Michael confronts Vincent",
  summary: "A proposed scene.",
  status: "proposed",
  source_client_name: "ChatGPT",
  source_actor_type: "ai_client",
  related_count: 1,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  resolved_at: null,
  payload: { content: "Draft scene text." },
  related_objects: [
    {
      object_id: "node-michael",
      relationship_type: "COLLECTS",
      direction: "incoming",
      note: "appears in",
    },
  ],
  source_provenance: {
    id: "prov-1",
    actor_type: "ai_client",
    client_type: "mcp",
    client_name: "ChatGPT",
    source_conversation_id: "conv-42",
    created_at: new Date().toISOString(),
  },
  resolution_provenance: null,
  resolution_note: null,
  accepted_node_id: null,
  superseded_by_proposal_id: null,
  revisions: [
    {
      id: "rev-1",
      proposal_id: "prop-1",
      revision_number: 1,
      title: "Michael confronts Vincent",
      summary: "A proposed scene.",
      payload: { content: "Draft scene text." },
      related_objects: [],
      change_summary: "Initial version",
      provenance: null,
      created_at: new Date().toISOString(),
    },
  ],
};

describe("proposal detail", () => {
  beforeEach(() => {
    vi.mocked(getProposal).mockReset().mockResolvedValue(detail);
    vi.mocked(transitionProposal).mockReset();
    vi.mocked(updateProposal).mockReset();
    push.mockReset();
  });

  it("shows content, proposed links, provenance, and revisions (AT-031)", async () => {
    render(<ProposalDetailPage />);
    expect(
      await screen.findByRole("heading", { name: "Michael confronts Vincent" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Draft scene text.")).toBeInTheDocument();
    expect(screen.getByText(/Proposed links \(1\)/)).toBeInTheDocument();
    // Provenance: client name and conversation reference are visible.
    expect(screen.getByText(/ai client — ChatGPT/)).toBeInTheDocument();
    expect(screen.getByText(/conv: conv-42/)).toBeInTheDocument();
    expect(screen.getByText(/Revision history \(1\)/)).toBeInTheDocument();
  });

  it("accepting calls the transition endpoint and navigates to the new node", async () => {
    vi.mocked(transitionProposal).mockResolvedValue({
      proposal: { ...detail, status: "accepted" },
      created_node_id: "node-new",
      created_edge_ids: ["edge-1"],
    });
    render(<ProposalDetailPage />);
    await screen.findByRole("heading", { name: "Michael confronts Vincent" });

    await userEvent.type(
      screen.getByPlaceholderText(/Resolution note/),
      "good to go",
    );
    await userEvent.click(screen.getByRole("button", { name: "Accept" }));

    await waitFor(() =>
      expect(vi.mocked(transitionProposal)).toHaveBeenCalledWith("prop-1", {
        to_status: "accepted",
        resolution_note: "good to go",
      }),
    );
    expect(push).toHaveBeenCalledWith("/nodes/node-new");
  });

  it("rejecting calls the transition endpoint and stays on the page", async () => {
    vi.mocked(transitionProposal).mockResolvedValue({
      proposal: { ...detail, status: "rejected" },
      created_node_id: null,
      created_edge_ids: [],
    });
    render(<ProposalDetailPage />);
    await screen.findByRole("heading", { name: "Michael confronts Vincent" });

    await userEvent.click(screen.getByRole("button", { name: "Reject" }));
    await waitFor(() =>
      expect(vi.mocked(transitionProposal)).toHaveBeenCalledWith("prop-1", {
        to_status: "rejected",
        resolution_note: null,
      }),
    );
    expect(push).not.toHaveBeenCalled();
  });

  it("editing before deciding sends the edited payload (AT-032)", async () => {
    vi.mocked(updateProposal).mockResolvedValue(detail);
    render(<ProposalDetailPage />);
    await screen.findByRole("heading", { name: "Michael confronts Vincent" });

    await userEvent.click(
      screen.getByRole("button", { name: "Edit before deciding" }),
    );
    const titleInput = screen.getByLabelText("Title");
    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, "Edited title");
    await userEvent.click(screen.getByRole("button", { name: "Save edit" }));

    await waitFor(() =>
      expect(vi.mocked(updateProposal)).toHaveBeenCalledWith(
        "prop-1",
        expect.objectContaining({
          title: "Edited title",
          change_summary: "Edited in review",
        }),
      ),
    );
  });

  it("hides resolve actions on resolved proposals", async () => {
    vi.mocked(getProposal).mockResolvedValue({
      ...detail,
      status: "rejected",
      resolution_note: "not this direction",
    });
    render(<ProposalDetailPage />);
    await screen.findByRole("heading", { name: "Michael confronts Vincent" });
    expect(screen.queryByRole("button", { name: "Accept" })).not.toBeInTheDocument();
    expect(screen.getByText(/not this direction/)).toBeInTheDocument();
  });
});
