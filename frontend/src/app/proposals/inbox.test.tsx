// Phase C3 — first component-level render tests (AT-030: proposal inbox).
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProposalSummary } from "@/lib/api";

vi.mock("@/lib/api", () => ({
  getProposals: vi.fn(),
  listProjects: vi.fn().mockResolvedValue([]),
}));

import { getProposals } from "@/lib/api";
import ProposalsPage from "./page";

const baseProposal: ProposalSummary = {
  id: "prop-1",
  project_hub_id: "hub-1",
  proposal_type: "scene",
  title: "Michael confronts Vincent",
  summary: "A proposed scene.",
  status: "proposed",
  source_client_name: "ChatGPT",
  source_actor_type: "ai_client",
  related_count: 2,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  resolved_at: null,
};

describe("proposal inbox", () => {
  beforeEach(() => {
    vi.mocked(getProposals).mockReset();
  });

  it("renders open proposals with title, type, source, and age (AT-030)", async () => {
    vi.mocked(getProposals).mockResolvedValue([baseProposal]);
    render(<ProposalsPage />);

    const row = (await screen.findByText("Michael confronts Vincent")).closest("a");
    expect(row).not.toBeNull();
    expect(within(row!).getByText("scene")).toBeInTheDocument();
    expect(screen.getByText(/from ChatGPT/)).toBeInTheDocument();
    expect(screen.getByText("2 linked")).toBeInTheDocument();
    // Default working set is the open group.
    expect(vi.mocked(getProposals)).toHaveBeenCalledWith(
      expect.objectContaining({
        statuses: ["captured", "proposed", "under_review"],
      }),
    );
  });

  it("switching to Accepted refetches with the accepted status", async () => {
    vi.mocked(getProposals).mockResolvedValue([]);
    render(<ProposalsPage />);
    await screen.findByText(/Nothing here/);

    await userEvent.click(screen.getByRole("button", { name: "Accepted" }));
    await waitFor(() =>
      expect(vi.mocked(getProposals)).toHaveBeenLastCalledWith(
        expect.objectContaining({ statuses: ["accepted"] }),
      ),
    );
  });

  it("shows the empty state when there are no proposals", async () => {
    vi.mocked(getProposals).mockResolvedValue([]);
    render(<ProposalsPage />);
    expect(await screen.findByText(/Nothing here/)).toBeInTheDocument();
  });
});
