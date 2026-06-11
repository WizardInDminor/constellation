import { describe, expect, it } from "vitest";

import {
  type Connection,
  connectionReason,
  connectionsFromDetail,
  groupConnectionsByRole,
  roleForConnection,
} from "./connectionsByRole";

function conn(over: Partial<Connection> = {}): Connection {
  return {
    edgeId: "e1",
    edgeType: "ELABORATES",
    direction: "outgoing",
    note: null,
    resolvedAt: null,
    resolvedByNodeId: null,
    neighbor: { id: "n1", title: "N", type: "permanent" },
    neighborTags: [],
    neighborIsStoryEvent: false,
    ...over,
  };
}

describe("roleForConnection", () => {
  it("classifies story events as scenes regardless of tags", () => {
    expect(roleForConnection(conn({ neighborIsStoryEvent: true }))).toBe(
      "scenes",
    );
  });

  it("maps reserved narrative tags to their role", () => {
    expect(
      roleForConnection(conn({ neighborTags: ["narrative:symbol"] })),
    ).toBe("symbols");
    expect(
      roleForConnection(conn({ neighborTags: ["narrative:character"] })),
    ).toBe("characters");
    expect(
      roleForConnection(conn({ neighborTags: ["narrative:lore-world-rule"] })),
    ).toBe("worldRules");
    expect(
      roleForConnection(conn({ neighborTags: ["narrative:open-question"] })),
    ).toBe("openQuestions");
  });

  it("falls back to generic Lore for other lore subtypes", () => {
    expect(
      roleForConnection(conn({ neighborTags: ["narrative:lore-history"] })),
    ).toBe("lore");
  });

  it("falls back to the node base type for untagged neighbors", () => {
    expect(
      roleForConnection(
        conn({ neighbor: { id: "s", title: "S", type: "source" } }),
      ),
    ).toBe("sources");
    expect(
      roleForConnection(
        conn({ neighbor: { id: "m", title: "M", type: "structure" } }),
      ),
    ).toBe("structures");
  });
});

describe("groupConnectionsByRole", () => {
  it("groups by role, drops empties, and keeps ROLE_ORDER", () => {
    const groups = groupConnectionsByRole([
      conn({
        edgeId: "1",
        neighbor: { id: "a", title: "A", type: "permanent" },
        neighborTags: ["narrative:character"],
      }),
      conn({
        edgeId: "2",
        neighbor: { id: "b", title: "B", type: "permanent" },
        neighborIsStoryEvent: true,
      }),
      conn({
        edgeId: "3",
        neighbor: { id: "c", title: "C", type: "permanent" },
        neighborTags: ["narrative:character"],
      }),
    ]);
    // scenes comes before characters in ROLE_ORDER.
    expect(groups.map((g) => g.key)).toEqual(["scenes", "characters"]);
    expect(groups[0].label).toBe("Scenes");
    expect(groups[1].items).toHaveLength(2);
  });

  it("ACCEPTANCE: a symbol connected to five scenes shows all under Scenes", () => {
    const conns = Array.from({ length: 5 }, (_, i) =>
      conn({
        edgeId: `s${i}`,
        neighbor: { id: `scene${i}`, title: `Scene ${i}`, type: "permanent" },
        neighborIsStoryEvent: true,
      }),
    );
    const groups = groupConnectionsByRole(conns);
    const scenes = groups.find((g) => g.key === "scenes");
    expect(scenes?.items).toHaveLength(5);
  });

  it("ACCEPTANCE: a world rule's connected events render under 'Demonstrated In'", () => {
    const conns = Array.from({ length: 3 }, (_, i) =>
      conn({
        edgeId: `e${i}`,
        direction: "incoming",
        edgeType: "EXPLAINS",
        neighbor: { id: `ev${i}`, title: `Event ${i}`, type: "permanent" },
        neighborIsStoryEvent: true,
      }),
    );
    // Caller supplies the override because the subject node is a world rule.
    const groups = groupConnectionsByRole(conns, {
      labelOverrides: { scenes: "Demonstrated In" },
    });
    expect(groups[0].key).toBe("scenes");
    expect(groups[0].label).toBe("Demonstrated In");
    expect(groups[0].items).toHaveLength(3);
  });
});

describe("connectionsFromDetail", () => {
  it("flattens outgoing + incoming and reads denormalised neighbor metadata", () => {
    const conns = connectionsFromDetail({
      outgoing_edges: [
        {
          id: "o1",
          type: "ELABORATES",
          neighbor: { id: "x", title: "X", type: "permanent" },
          neighbor_tags: [{ name: "narrative:symbol" }],
          neighbor_is_story_event: false,
        },
      ],
      incoming_edges: [
        {
          id: "i1",
          type: "EXPLAINS",
          neighbor: { id: "y", title: "Y", type: "permanent" },
          neighbor_is_story_event: true,
        },
      ],
    });
    expect(conns).toHaveLength(2);
    expect(conns[0].direction).toBe("outgoing");
    expect(conns[0].neighborTags).toEqual(["narrative:symbol"]);
    expect(conns[1].direction).toBe("incoming");
    expect(conns[1].neighborIsStoryEvent).toBe(true);
  });
});

describe("connectionReason", () => {
  it("is direction-aware", () => {
    expect(
      connectionReason(conn({ edgeType: "SUPPORTS", direction: "outgoing" })),
    ).toBe("supports");
    expect(
      connectionReason(conn({ edgeType: "SUPPORTS", direction: "incoming" })),
    ).toBe("supported by");
  });

  it("annotates resolved edges", () => {
    expect(
      connectionReason(
        conn({ edgeType: "QUESTIONS", resolvedAt: "2026-01-01T00:00:00Z" }),
      ),
    ).toBe("questions · resolved");
  });
});
