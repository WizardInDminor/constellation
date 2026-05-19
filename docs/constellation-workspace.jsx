import { useState, useEffect, useRef } from "react";

// ─── Design tokens ──────────────────────────────────────────────────────────
const tokens = {
  bg0: "#0e0e0f",
  bg1: "#141415",
  bg2: "#1a1a1c",
  bg3: "#222225",
  bg4: "#2a2a2e",
  border: "#2e2e33",
  borderHover: "#44444a",
  text0: "#f0ede8",
  text1: "#c4bfb8",
  text2: "#87827a",
  text3: "#524f4a",
  amber: "#e8a94a",
  amberDim: "#a97830",
  amberGlow: "rgba(232,169,74,0.12)",
  green: "#5db888",
  greenDim: "#3a7a58",
  blue: "#6ba3d6",
  blueDim: "#3a6a96",
  rose: "#d47a7a",
  roseDim: "#8a4a4a",
  purple: "#9b7fd4",
  purpleDim: "#5a4a8a",
};

// ─── Mode configs ────────────────────────────────────────────────────────────
const modes = {
  research: {
    id: "research",
    label: "Research",
    accent: tokens.blue,
    accentDim: tokens.blueDim,
    accentGlow: "rgba(107,163,214,0.10)",
    icon: "⬡",
    tagline: "Python for Excel Heavy Workflows",
    sessionNum: 1,
    sessionIntent: "Understand when to reach for openpyxl vs xlwings",
    goals: [
      "Understand when to reach for openpyxl, xlwings, or another tool",
      "Write scripts that update formatted time-based reports",
      "Understand how to preprocess data with Pandas when needed",
      "Create at least one reusable Python-driven Excel workflow",
    ],
    priorKnowledge:
      "Some general knowledge about what these tools can do, but very little syntax internalized. Would struggle writing anything from scratch. A few scattered notes already in the DB.",
    corpusMatches: [
      { title: "Pandas DataFrame basics", similarity: 0.81, type: "perm" },
      { title: "Python file I/O patterns", similarity: 0.74, type: "perm" },
      { title: "openpyxl — note from a Stack Overflow session", similarity: 0.68, type: "fleet" },
    ],
    sources: [
      { title: "openpyxl documentation", url: "https://openpyxl.readthedocs.io", status: "linked" },
      { title: "xlwings docs", url: "https://docs.xlwings.org", status: "suggested" },
    ],
    subTopics: ["openpyxl basics", "xlwings for live Excel", "Pandas preprocessing", "Report automation patterns"],
    scratchpad: "Start with openpyxl — it seems more portable (no Excel needed to run). xlwings requires desktop Excel which may limit where I can run scripts.\n\nQuestion: can openpyxl modify .xlsm files (macro-enabled)? Need to check.\n\nPossible approach for the report: read raw data CSV → Pandas for pivoting → openpyxl to write into formatted template.",
    rightPanel: {
      type: "research",
      bridges: [
        { a: "Pandas groupby", b: "Excel pivot tables", sim: "0.79" },
        { a: "Python file paths", b: "VBA workbook references", sim: "0.71" },
      ],
      recentActivity: [
        { verb: "accepted", title: "Pandas DataFrame basics" },
        { verb: "linked", title: "openpyxl documentation" },
        { verb: "captured", title: "3 fleeting notes" },
      ],
    },
  },
  narrative: {
    id: "narrative",
    label: "Narrative",
    accent: tokens.amber,
    accentDim: tokens.amberDim,
    accentGlow: tokens.amberGlow,
    icon: "◈",
    tagline: "Fire Stoker",
    sessionNum: 3,
    sessionIntent: "Location and environment details — lighthouse + harbor",
    goals: [
      "Flesh out the lighthouse environment as a character in itself",
      "Capture the harbor master's role and atmosphere",
      "Document the light-as-truth motif in the harbor scenes",
    ],
    characters: [
      { name: "Michael", role: "Protagonist", archetype: "Protagonist", notes: "Sees Leon in dreams before meeting him." },
      { name: "Leon", role: "Side character / catalyst", archetype: "Supporting", notes: "Harassed by cops. Disappears after therapy session day." },
      { name: "The Harbor Master", role: "Environmental voice", archetype: "Other / Complex", notes: "Still working out — may be unreliable narrator of the port." },
    ],
    themes: [
      {
        name: "Light as truth",
        richness: "high",
        notes: "Fluorescent = manufactured truth. Sunlight = natural truth. Firelight = brutal, primal truth. Should feel inevitable not symbolic.",
        events: ["Harbor arrival", "Therapy session corridor", "Climactic meeting"],
      },
      { name: "Liminality", richness: "medium", notes: "Threshold spaces — harbor, waiting rooms, the dream-state between sleep and waking.", events: [] },
    ],
    events: [
      { title: "Michael's first dream of Leon", act: "Act 1", status: "placeholder", discourse: 1 },
      { title: "Michael and Leon meet at work", act: "Act 1", status: "placeholder", discourse: 2 },
      { title: "Second dream", act: "Act 1", status: "draft", discourse: 3 },
      { title: "Therapy session day — Leon seen with cops", act: "Act 2", status: "placeholder", discourse: 4 },
      { title: "Side character death", act: "Act 2", status: "placeholder", discourse: 5 },
      { title: "Demonization of protagonist", act: "Act 3", status: "placeholder", discourse: 6 },
      { title: "Climactic meeting", act: "Act 3", status: "placeholder", discourse: 7 },
      { title: "Redemption scene", act: "Act 3", status: "placeholder", discourse: 8 },
    ],
    scratchpad: "The harbor at night — sodium vapor lights turning the water the color of old paper. Not warm. Performed warmth. Michael stands at the railing and thinks about what it means to see something clearly.\n\nThe lighthouse beam is different. Honest sweep. No attempt to flatter.\n\nHarbor master knows something. Maybe doesn't know he knows it.",
    rightPanel: {
      type: "narrative",
      openQuestions: [
        "Does the harbor master appear before or after Leon disappears?",
        "Is the lighthouse visible from Michael's apartment window?",
        "What does firelight actually look like in this story — do we ever see open flame?",
      ],
      themeActivity: [
        { theme: "Light as truth", event: "Harbor arrival", action: "tagged" },
        { theme: "Liminality", event: "Therapy session day", action: "tagged" },
      ],
    },
    sceneContext: {
      scene: { title: "Michael at the harbor — night arrival", act: "Act 1", discourse: 2, status: "placeholder" },
      characters: [
        {
          name: "Michael",
          archetype: "Protagonist",
          relevance: "strong",
          coreWound: "Believes connection requires him to betray himself",
          activeTraits: ["Hypervigilant", "Searching for pattern", "Distrusts comfort"],
          authorNote: "He looks at light sources when lying to himself. Harbor = fluorescent sodium vapor. Watch for it.",
          arcNote: null,
        },
        {
          name: "Harbor Master",
          archetype: "Other / Complex",
          relevance: "strong",
          coreWound: "Author-only",
          activeTraits: ["Knows more than he says", "Unreliable narrator of the port"],
          authorNote: "Don't make him sinister. He should feel like worn furniture — present, unremarkable, load-bearing.",
          arcNote: null,
        },
      ],
      location: {
        name: "The Harbor",
        atmosphere: "Sodium vapor lights turning water the color of old paper. Performed warmth. Not the honest light of the lighthouse.",
        loreSurface: [
          { title: "The grief network meeting place", category: "History", relevance: "strong", text: "This harbor warehouse district was where the grief support network met after the riots. Government surveillance of those meetings is what radicalized the underground. Michael doesn't know this — but he feels it.", visibility: "Author-only" },
          { title: "Riots blocked the rebuild", category: "History", relevance: "moderate", text: "Government blocked organized rebuild after the riots to make an example. The decay here is deliberate policy, not neglect.", visibility: "Reader-inferred" },
        ],
      },
      themes: [
        { name: "Light as truth", relevance: "strong", canonicalNote: "Sodium vapor = manufactured truth. Sunlight = natural. Firelight = brutal. This scene: manufactured truth everywhere. Michael is not seeing clearly here and the light tells you so." },
        { name: "Liminality", relevance: "moderate", canonicalNote: "The harbor is a threshold — between land and water, between the known city and whatever is out there. Michael is always most vulnerable at thresholds." },
      ],
      worldRules: [
        { title: "Mass surveillance drove the underground off-grid", collapsed: true },
        { title: "The real underground would never be obvious", collapsed: true },
      ],
      arcNotes: [
        { note: "This scene: Michael still trusts Ian fully. That trust is what makes what's coming devastating.", event: "Before the harm" },
      ],
    },
  },
  learning: {
    id: "learning",
    label: "Learning",
    accent: tokens.green,
    accentDim: tokens.greenDim,
    accentGlow: "rgba(93,184,136,0.10)",
    icon: "◎",
    tagline: "Motor Encoders",
    sessionNum: 1, // overridden by demoSession state in main component
    sessionIntent: "Complete Phase 1 — Encoder fundamentals",
    motivation: "Workplace has hundreds of machines, each with multiple motors. Need to reason about encoders in an industrial robotics environment.",
    goals: [
      "Understand what encoders are and how they track position and speed",
      "Distinguish absolute vs incremental encoders",
      "Understand common failure modes including losing counts",
    ],
    quickCorrections: [
      {
        wrong: "\"I think they use something called grayscale\"",
        correct: "Encoders use Gray code — a binary numeral system where adjacent values differ by only one bit, reducing counting errors at position transitions.",
        saved: false,
      },
      {
        wrong: "Unclear if only AC motors use encoders",
        correct: "Both AC and DC motors use encoders. The encoder is independent of motor type — it attaches to the shaft and tracks rotation regardless of what drives it.",
        saved: true,
      },
    ],
    learningMap: [
      {
        phase: 1,
        title: "Encoder fundamentals",
        status: "active",
        subTopics: [
          { title: "What encoders track (rotation, position, speed)", complete: true },
          { title: "Gray code and why it reduces errors", complete: false },
          { title: "Absolute vs incremental encoders", complete: false },
        ],
        goal: "Explain in your own words how an encoder converts physical rotation to a digital signal.",
        source: "openencoders.org — Chapter 1",
      },
      {
        phase: 2,
        title: "Motor compatibility",
        status: "locked",
        subTopics: [
          { title: "AC vs DC motors with encoders", complete: false },
          { title: "Stepper motor differences", complete: false },
        ],
        goal: "Identify which encoder type is appropriate for a given motor application.",
        source: "Encoder selection guide (PDF)",
      },
      {
        phase: 3,
        title: "Failure modes & diagnostics",
        status: "locked",
        subTopics: [
          { title: "Losing counts — causes by component", complete: false },
          { title: "Cable and connector failure patterns", complete: false },
        ],
        goal: "Diagnose a 'losing counts' failure and identify probable root cause.",
        source: "TBD — see open problem: source materials",
      },
      {
        phase: 4,
        title: "Industrial robotics application",
        status: "locked",
        subTopics: [
          { title: "Multi-axis encoder coordination", complete: false },
          { title: "Reasoning about encoder specs in industrial context", complete: false },
        ],
        goal: "Apply encoder concepts to reason about a real machine in your workplace.",
        source: "Workplace documentation + corpus notes",
      },
    ],
    notes: [
      {
        title: "Encoders track rotation, not position directly",
        content: "An encoder outputs pulses as the shaft rotates. Position is calculated by counting pulses from a known reference point, not measured directly.",
        verified: true,
        phase: 1,
        subTopic: "What encoders track",
      },
    ],
    sessionNotes: [
      {
        title: "Encoders track rotation, not position directly",
        content: "An encoder outputs pulses as the shaft rotates. Position is calculated by counting pulses from a known reference point, not measured directly.",
        verified: true,
        phase: 1,
        subTopic: "What encoders track",
        addedSession: 1,
      },
      {
        title: "Gray code prevents double-counting at boundaries",
        content: "Adjacent Gray code values differ by exactly one bit. At a position boundary where multiple bits change simultaneously, Gray code ensures only one bit flips — eliminating the counting errors that binary would introduce.",
        verified: true,
        phase: 1,
        subTopic: "Gray code and why it reduces errors",
        addedSession: 2,
      },
      {
        title: "Absolute vs incremental — key distinction",
        content: "Incremental encoders count pulses from a reference point and lose position on power loss. Absolute encoders encode actual position in the signal — no homing required after restart. Critical consideration for industrial machines that may lose power mid-cycle.",
        verified: false,
        phase: 1,
        subTopic: "Absolute vs incremental encoders",
        addedSession: 2,
      },
    ],
    scratchpad: "Reading the fundamentals chapter now. The rotation → pulse → count → position chain makes sense. The reference point thing is interesting — absolute encoders must encode position in the signal itself rather than counting from zero?\n\nGray code explanation is dense. Coming back to this.",
    rightPanel: {
      type: "learning",
      coverage: [
        { topic: "Encoder fundamentals", sources: 1, notes: 1, complete: 1, total: 3 },
        { topic: "Motor compatibility", sources: 0, notes: 0, complete: 0, total: 2 },
        { topic: "Failure modes", sources: 0, notes: 0, complete: 0, total: 2 },
        { topic: "Industrial application", sources: 0, notes: 0, complete: 0, total: 2 },
      ],
      auditReady: true,
    },
  },
};

// ─── Sub-components ──────────────────────────────────────────────────────────

function Tag({ children, color, dim }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center",
      fontSize: 10, fontWeight: 600, letterSpacing: "0.06em",
      textTransform: "uppercase", padding: "2px 7px",
      borderRadius: 3, border: `1px solid ${dim}`,
      color: color, background: `${color}14`,
    }}>{children}</span>
  );
}

function Panel({ children, style = {} }) {
  return (
    <div style={{
      background: tokens.bg1,
      border: `1px solid ${tokens.border}`,
      borderRadius: 8,
      padding: "14px 16px",
      ...style,
    }}>{children}</div>
  );
}

function SectionLabel({ children }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 700, letterSpacing: "0.1em",
      textTransform: "uppercase", color: tokens.text3,
      marginBottom: 10,
    }}>{children}</div>
  );
}

function Dot({ color }) {
  return <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, display: "inline-block", flexShrink: 0 }} />;
}

// ─── Left panels ─────────────────────────────────────────────────────────────

function ResearchLeft({ mode, data }) {
  const [accepted, setAccepted] = useState([]);
  const [dismissed, setDismissed] = useState([]);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <Panel>
        <SectionLabel>Goals</SectionLabel>
        {data.goals.map((g, i) => (
          <div key={i} style={{ display: "flex", gap: 8, marginBottom: 7, alignItems: "flex-start" }}>
            <span style={{ color: mode.accent, fontSize: 11, marginTop: 2, flexShrink: 0 }}>
              {i + 1}.
            </span>
            <span style={{ fontSize: 12, color: tokens.text1, lineHeight: 1.5 }}>{g}</span>
          </div>
        ))}
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${tokens.border}` }}>
          <button style={{
            fontSize: 11, color: mode.accent, background: "none", border: "none",
            cursor: "pointer", padding: 0, opacity: 0.7,
          }}>+ Add goal</button>
        </div>
      </Panel>

      <Panel>
        <SectionLabel>Sub-topics sketch</SectionLabel>
        {data.subTopics.map((s, i) => (
          <div key={i} style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "5px 0",
            borderBottom: i < data.subTopics.length - 1 ? `1px solid ${tokens.border}` : "none",
          }}>
            <span style={{
              width: 14, height: 14, borderRadius: 2,
              border: `1px solid ${tokens.border}`,
              flexShrink: 0,
            }} />
            <span style={{ fontSize: 12, color: tokens.text1 }}>{s}</span>
          </div>
        ))}
      </Panel>

      {dismissed.length < data.corpusMatches.length && (
        <Panel>
          <SectionLabel>Corpus matches</SectionLabel>
          {data.corpusMatches.filter((_, i) => !dismissed.includes(i)).map((m, i) => (
            <div key={i} style={{
              padding: "7px 0",
              borderBottom: `1px solid ${tokens.border}`,
            }}>
              <div style={{ fontSize: 12, color: tokens.text0, marginBottom: 4 }}>{m.title}</div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 11, color: tokens.text3 }}>
                  {(m.similarity * 100).toFixed(0)}% similar
                </span>
                <div style={{ display: "flex", gap: 6 }}>
                  {!accepted.includes(i) ? (
                    <>
                      <button onClick={() => setAccepted([...accepted, i])} style={{
                        fontSize: 10, padding: "2px 8px", borderRadius: 3,
                        background: mode.accentGlow, border: `1px solid ${mode.accentDim}`,
                        color: mode.accent, cursor: "pointer",
                      }}>Accept</button>
                      <button onClick={() => setDismissed([...dismissed, i])} style={{
                        fontSize: 10, padding: "2px 8px", borderRadius: 3,
                        background: "none", border: `1px solid ${tokens.border}`,
                        color: tokens.text3, cursor: "pointer",
                      }}>Dismiss</button>
                    </>
                  ) : (
                    <span style={{ fontSize: 10, color: mode.accent }}>✓ In scope</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </Panel>
      )}
    </div>
  );
}

function NarrativeLeft({ mode, data }) {
  const [activeChar, setActiveChar] = useState(0);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <Panel>
        <SectionLabel>Characters</SectionLabel>
        {data.characters.map((c, i) => (
          <div key={i}
            onClick={() => setActiveChar(i)}
            style={{
              padding: "8px 10px", borderRadius: 5, cursor: "pointer",
              background: activeChar === i ? `${mode.accent}12` : "none",
              border: `1px solid ${activeChar === i ? mode.accentDim : "transparent"}`,
              marginBottom: 4,
            }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 3 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: tokens.text0 }}>{c.name}</span>
              <Tag color={mode.accent} dim={mode.accentDim}>{c.archetype}</Tag>
            </div>
            <div style={{ fontSize: 11, color: tokens.text2 }}>{c.role}</div>
            {activeChar === i && (
              <div style={{ fontSize: 11, color: tokens.text1, marginTop: 6, lineHeight: 1.5 }}>{c.notes}</div>
            )}
          </div>
        ))}
        <button style={{
          fontSize: 11, color: mode.accent, background: "none", border: "none",
          cursor: "pointer", padding: "6px 0 0", opacity: 0.7,
        }}>+ Add character</button>
      </Panel>

      <Panel>
        <SectionLabel>Themes</SectionLabel>
        {data.themes.map((t, i) => (
          <div key={i} style={{
            padding: "8px 10px", borderRadius: 5,
            background: i === 0 ? `${mode.accent}08` : "none",
            border: `1px solid ${i === 0 ? mode.accentDim : tokens.border}`,
            marginBottom: 6,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: tokens.text0 }}>{t.name}</span>
              {t.richness === "high" && <Tag color={mode.accent} dim={mode.accentDim}>Rich</Tag>}
            </div>
            <div style={{ fontSize: 11, color: tokens.text2, lineHeight: 1.5 }}>{t.notes}</div>
            {t.events.length > 0 && (
              <div style={{ marginTop: 6, display: "flex", gap: 4, flexWrap: "wrap" }}>
                {t.events.map((e, j) => (
                  <span key={j} style={{
                    fontSize: 10, padding: "2px 6px", borderRadius: 2,
                    background: tokens.bg3, color: tokens.text2,
                  }}>{e}</span>
                ))}
              </div>
            )}
          </div>
        ))}
        <button style={{
          fontSize: 11, color: mode.accent, background: "none", border: "none",
          cursor: "pointer", padding: "4px 0 0", opacity: 0.7,
        }}>+ Add theme</button>
      </Panel>
    </div>
  );
}

function LearningLeft({ mode, data }) {
  const [savedCorrections, setSaved] = useState(data.quickCorrections.map(c => c.saved));
  const [noteSort, setNoteSort] = useState("phase"); // "phase" | "recent"

  const isSession1 = data.sessionNum === 1;
  const totalSubs = data.learningMap.reduce((a, p) => a + p.subTopics.length, 0);
  const completeSubs = data.learningMap.reduce((a, p) => a + p.subTopics.filter(s => s.complete).length, 0);
  const activePhase = data.learningMap.find(p => p.status === "active");

  const sortedNotes = [...(data.sessionNotes || [])].sort((a, b) =>
    noteSort === "phase"
      ? a.phase - b.phase || a.addedSession - b.addedSession
      : b.addedSession - a.addedSession
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Progress — always visible */}
      <Panel style={{ background: `${mode.accent}0a`, border: `1px solid ${mode.accentDim}` }}>
        <SectionLabel>Progress</SectionLabel>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 8 }}>
          <span style={{ fontSize: 28, fontWeight: 700, color: mode.accent, fontFamily: "monospace" }}>
            {completeSubs}
          </span>
          <span style={{ fontSize: 14, color: tokens.text2 }}>/ {totalSubs} sub-topics</span>
        </div>
        <div style={{ height: 4, background: tokens.bg3, borderRadius: 2, overflow: "hidden" }}>
          <div style={{
            height: "100%", borderRadius: 2, background: mode.accent,
            width: `${(completeSubs / totalSubs) * 100}%`,
            transition: "width 0.5s ease",
          }} />
        </div>
        <div style={{ fontSize: 11, color: tokens.text3, marginTop: 6 }}>
          {activePhase ? `${activePhase.title} active` : "All phases complete"}
        </div>
      </Panel>

      {/* Session 1 only: Quick corrections */}
      {isSession1 && (
        <Panel>
          <SectionLabel>Quick corrections</SectionLabel>
          <div style={{ fontSize: 11, color: tokens.text2, marginBottom: 10, lineHeight: 1.5 }}>
            Found in your prior knowledge entry
          </div>
          {data.quickCorrections.map((c, i) => (
            <div key={i} style={{
              padding: "8px 10px", borderRadius: 5,
              background: tokens.bg2, border: `1px solid ${tokens.border}`,
              marginBottom: 6,
            }}>
              <div style={{ fontSize: 11, color: tokens.rose, marginBottom: 4, fontStyle: "italic" }}>{c.wrong}</div>
              <div style={{ fontSize: 12, color: tokens.text1, lineHeight: 1.5, marginBottom: 6 }}>{c.correct}</div>
              {!savedCorrections[i] ? (
                <button onClick={() => { const s = [...savedCorrections]; s[i] = true; setSaved(s); }} style={{
                  fontSize: 10, padding: "3px 10px", borderRadius: 3,
                  background: mode.accentGlow, border: `1px solid ${mode.accentDim}`,
                  color: mode.accent, cursor: "pointer",
                }}>Save as permanent note</button>
              ) : (
                <span style={{ fontSize: 10, color: mode.accent }}>✓ Saved to corpus</span>
              )}
            </div>
          ))}
        </Panel>
      )}

      {/* Session 2+: Learning notes */}
      {!isSession1 && (
        <Panel>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <SectionLabel>My notes</SectionLabel>
            <div style={{ display: "flex", gap: 4 }}>
              {["phase", "recent"].map(s => (
                <button key={s} onClick={() => setNoteSort(s)} style={{
                  fontSize: 10, padding: "2px 8px", borderRadius: 3,
                  background: noteSort === s ? mode.accentGlow : "none",
                  border: `1px solid ${noteSort === s ? mode.accentDim : tokens.border}`,
                  color: noteSort === s ? mode.accent : tokens.text3,
                  cursor: "pointer", textTransform: "capitalize",
                }}>{s}</button>
              ))}
            </div>
          </div>
          {sortedNotes.length === 0 && (
            <div style={{ fontSize: 12, color: tokens.text3, fontStyle: "italic" }}>
              No notes yet — use the scratchpad to capture learnings.
            </div>
          )}
          {sortedNotes.map((n, i) => {
            const phase = data.learningMap[n.phase - 1];
            return (
              <div key={i} style={{
                padding: "8px 10px", borderRadius: 5,
                background: tokens.bg2,
                border: `1px solid ${n.verified ? mode.accentDim : tokens.border}`,
                marginBottom: 6,
              }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 500, color: tokens.text0, lineHeight: 1.4 }}>{n.title}</span>
                  {n.verified && (
                    <span style={{ fontSize: 9, color: mode.accent, flexShrink: 0, marginTop: 2 }}>✓</span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: tokens.text2, lineHeight: 1.5, marginBottom: 6 }}>
                  {n.content.length > 100 ? n.content.slice(0, 100) + "…" : n.content}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 2, background: tokens.bg3, color: tokens.text3 }}>
                    P{n.phase}
                  </span>
                  <span style={{ fontSize: 10, color: tokens.text3 }}>{n.subTopic}</span>
                </div>
              </div>
            );
          })}
          <button style={{
            fontSize: 11, color: mode.accent, background: "none", border: "none",
            cursor: "pointer", padding: "6px 0 0", opacity: 0.7,
          }}>+ Add note</button>
        </Panel>
      )}
    </div>
  );
}

// ─── Center panels ────────────────────────────────────────────────────────────

function ResearchCenter({ mode, data }) {
  const [tab, setTab] = useState("write");
  const tabs = ["write", "notes", "sources"];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${tokens.border}`, marginBottom: 16 }}>
        {tabs.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: "8px 16px", fontSize: 12, fontWeight: tab === t ? 600 : 400,
            color: tab === t ? mode.accent : tokens.text2,
            background: "none", border: "none", cursor: "pointer",
            borderBottom: tab === t ? `2px solid ${mode.accent}` : "2px solid transparent",
            marginBottom: -1, textTransform: "capitalize",
          }}>{t}</button>
        ))}
      </div>

      {tab === "write" && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12 }}>
          <Panel style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <SectionLabel>Scratchpad</SectionLabel>
              <span style={{ fontSize: 10, color: tokens.text3 }}>autosaving</span>
            </div>
            <div style={{
              fontSize: 13, color: tokens.text1, lineHeight: 1.7,
              fontFamily: "'Fira Code', 'Courier New', monospace",
              whiteSpace: "pre-wrap",
            }}>{data.scratchpad}</div>
            <div style={{
              marginTop: 12, paddingTop: 12,
              borderTop: `1px solid ${tokens.border}`,
              display: "flex", gap: 8,
            }}>
              <span style={{ fontSize: 11, color: tokens.text3 }}>Promote to →</span>
              {["Permanent note", "Fleeting note"].map(t => (
                <button key={t} style={{
                  fontSize: 11, padding: "3px 10px", borderRadius: 3,
                  background: "none", border: `1px solid ${tokens.border}`,
                  color: tokens.text2, cursor: "pointer",
                }}>{t}</button>
              ))}
            </div>
          </Panel>
          <Panel>
            <div style={{ fontSize: 11, color: tokens.text2, fontStyle: "italic" }}>
              💡 Make fleeting notes freely here — they're automatically collected by this project and can be sorted, processed, or discarded later. Capture ideas, questions, and insights when they hit.
            </div>
          </Panel>
        </div>
      )}

      {tab === "sources" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {data.sources.map((s, i) => (
            <Panel key={i}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontSize: 13, color: tokens.text0, marginBottom: 3 }}>{s.title}</div>
                  <div style={{ fontSize: 11, color: tokens.text3, fontFamily: "monospace" }}>{s.url}</div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <Tag color={s.status === "linked" ? mode.accent : tokens.text2} dim={s.status === "linked" ? mode.accentDim : tokens.border}>
                    {s.status}
                  </Tag>
                  <button style={{
                    fontSize: 11, padding: "4px 10px", borderRadius: 3,
                    background: `${mode.accent}15`, border: `1px solid ${mode.accentDim}`,
                    color: mode.accent, cursor: "pointer",
                  }}>Launch ↗</button>
                </div>
              </div>
            </Panel>
          ))}
          <button style={{
            fontSize: 12, padding: "10px", borderRadius: 5,
            background: "none", border: `1px dashed ${tokens.border}`,
            color: tokens.text3, cursor: "pointer", textAlign: "center",
          }}>+ Link source material</button>
        </div>
      )}

      {tab === "notes" && (
        <Panel>
          <div style={{ fontSize: 12, color: tokens.text3, textAlign: "center", padding: "20px 0", fontStyle: "italic" }}>
            No permanent notes yet — use the scratchpad to capture ideas,<br />then promote what's worth keeping.
          </div>
        </Panel>
      )}
    </div>
  );
}

// ─── Scene Context View ──────────────────────────────────────────────────────

function RelevancePip({ level }) {
  const colors = { strong: tokens.amber, moderate: tokens.blue, background: tokens.text3 };
  const labels = { strong: "Strong", moderate: "Moderate", background: "Background" };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      {[0,1,2].map(i => (
        <span key={i} style={{
          width: 5, height: 5, borderRadius: "50%",
          background: (level === "strong" && i <= 2) || (level === "moderate" && i <= 1)
            ? colors[level] : tokens.bg3,
        }} />
      ))}
      <span style={{ fontSize: 9, color: colors[level], letterSpacing: "0.05em", textTransform: "uppercase", fontWeight: 600 }}>
        {labels[level]}
      </span>
    </span>
  );
}

function NodePopup({ node, onClose, accent, accentDim }) {
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 100,
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: tokens.bg1, border: `1px solid ${accentDim}`,
        borderRadius: 10, padding: "20px 22px", width: 420, maxWidth: "90vw",
        boxShadow: `0 0 40px ${accent}20`,
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: tokens.text0 }}>{node.title || node.name}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: tokens.text3, cursor: "pointer", fontSize: 16 }}>×</button>
        </div>
        {node.content && <div style={{ fontSize: 12, color: tokens.text1, lineHeight: 1.6, marginBottom: 14 }}>{node.content}</div>}
        {node.text && <div style={{ fontSize: 12, color: tokens.text1, lineHeight: 1.6, marginBottom: 14 }}>{node.text}</div>}
        {node.canonicalNote && <div style={{ fontSize: 12, color: tokens.text1, lineHeight: 1.6, marginBottom: 14 }}>{node.canonicalNote}</div>}
        {node.authorNote && (
          <div style={{ padding: "8px 10px", borderRadius: 4, background: `${accent}0a`, border: `1px solid ${accentDim}`, marginBottom: 14 }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: accent, marginBottom: 4 }}>Author note</div>
            <div style={{ fontSize: 12, color: tokens.text1, lineHeight: 1.5 }}>{node.authorNote}</div>
          </div>
        )}
        <div style={{ display: "flex", gap: 8, paddingTop: 12, borderTop: `1px solid ${tokens.border}` }}>
          {["Edit content", "+ Add edge", "Add tag"].map(a => (
            <button key={a} style={{
              fontSize: 11, padding: "4px 10px", borderRadius: 3,
              background: "none", border: `1px solid ${tokens.border}`,
              color: tokens.text2, cursor: "pointer",
            }}>{a}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

function SceneContextView({ mode, data, onExit }) {
  const sc = data.sceneContext;
  const [popupNode, setPopupNode] = useState(null);
  const [worldRulesOpen, setWorldRulesOpen] = useState(false);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {popupNode && <NodePopup node={popupNode} onClose={() => setPopupNode(null)} accent={mode.accent} accentDim={mode.accentDim} />}

      {/* Scene header */}
      <div style={{
        padding: "10px 14px", background: `${mode.accent}08`,
        border: `1px solid ${mode.accentDim}`, borderRadius: 7, marginBottom: 14,
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: tokens.text0, marginBottom: 2 }}>{sc.scene.title}</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Tag color={mode.accent} dim={mode.accentDim}>{sc.scene.act}</Tag>
            <span style={{ fontSize: 11, color: tokens.text3 }}>Discourse position {sc.scene.discourse}</span>
            <Tag color={tokens.text3} dim={tokens.border}>{sc.scene.status}</Tag>
          </div>
        </div>
        <button onClick={onExit} style={{
          fontSize: 11, padding: "5px 12px", borderRadius: 4,
          background: "none", border: `1px solid ${tokens.border}`,
          color: tokens.text2, cursor: "pointer",
        }}>← Back to timeline</button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 12 }}>

        {/* Characters */}
        <Panel>
          <SectionLabel>Characters in scene</SectionLabel>
          {sc.characters.map((c, i) => (
            <div key={i} style={{
              padding: "10px 12px", borderRadius: 6,
              background: tokens.bg2, border: `1px solid ${tokens.border}`,
              marginBottom: 8, cursor: "pointer",
            }} onClick={() => setPopupNode(c)}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: tokens.text0 }}>{c.name}</span>
                  <Tag color={mode.accent} dim={mode.accentDim}>{c.archetype}</Tag>
                </div>
                <RelevancePip level={c.relevance} />
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: c.authorNote ? 6 : 0 }}>
                {c.activeTraits.map((t, j) => (
                  <span key={j} style={{
                    fontSize: 10, padding: "2px 7px", borderRadius: 2,
                    background: tokens.bg3, color: tokens.text2,
                  }}>{t}</span>
                ))}
              </div>
              {c.authorNote && (
                <div style={{
                  padding: "6px 8px", borderRadius: 3,
                  background: `${mode.accent}08`, border: `1px solid ${mode.accentDim}`,
                  fontSize: 11, color: tokens.text1, lineHeight: 1.5, marginTop: 4,
                }}>
                  <span style={{ color: mode.accent, fontWeight: 600, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.06em" }}>Author note · </span>
                  {c.authorNote}
                </div>
              )}
              <div style={{ fontSize: 10, color: tokens.text3, marginTop: 6 }}>⌃ + click to edit</div>
            </div>
          ))}
        </Panel>

        {/* Location + lore */}
        <Panel>
          <SectionLabel>Location</SectionLabel>
          <div style={{ fontSize: 13, fontWeight: 600, color: tokens.text0, marginBottom: 4 }}>{sc.location.name}</div>
          <div style={{ fontSize: 12, color: tokens.text2, lineHeight: 1.6, marginBottom: 12, fontStyle: "italic" }}>{sc.location.atmosphere}</div>
          <SectionLabel>Lore surfaced from location</SectionLabel>
          {sc.location.loreSurface.map((l, i) => (
            <div key={i} style={{
              padding: "8px 10px", borderRadius: 5,
              background: tokens.bg2, border: `1px solid ${tokens.border}`,
              marginBottom: 6, cursor: "pointer",
            }} onClick={() => setPopupNode(l)}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Tag color={tokens.purple} dim={tokens.purpleDim}>{l.category}</Tag>
                  <span style={{ fontSize: 12, fontWeight: 500, color: tokens.text0 }}>{l.title}</span>
                </div>
                <RelevancePip level={l.relevance} />
              </div>
              <div style={{ fontSize: 11, color: tokens.text1, lineHeight: 1.5 }}>{l.text}</div>
              <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 6 }}>
                <Tag color={l.visibility === "Author-only" ? tokens.rose : tokens.text2}
                  dim={l.visibility === "Author-only" ? tokens.roseDim : tokens.border}>
                  {l.visibility}
                </Tag>
              </div>
            </div>
          ))}
        </Panel>

        {/* Themes */}
        <Panel>
          <SectionLabel>Active themes</SectionLabel>
          {sc.themes.map((t, i) => (
            <div key={i} style={{
              padding: "8px 10px", borderRadius: 5,
              background: tokens.bg2, border: `1px solid ${tokens.border}`,
              marginBottom: 6, cursor: "pointer",
            }} onClick={() => setPopupNode(t)}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: mode.accent }}>{t.name}</span>
                <RelevancePip level={t.relevance} />
              </div>
              <div style={{ fontSize: 11, color: tokens.text1, lineHeight: 1.5 }}>{t.canonicalNote}</div>
            </div>
          ))}
        </Panel>

        {/* Arc notes */}
        <Panel>
          <SectionLabel>Arc notes for this moment</SectionLabel>
          {sc.arcNotes.map((a, i) => (
            <div key={i} style={{ padding: "8px 0", borderBottom: `1px solid ${tokens.border}` }}>
              <div style={{ fontSize: 11, color: tokens.text2, lineHeight: 1.5 }}>{a.note}</div>
              <div style={{ fontSize: 10, color: tokens.text3, marginTop: 4 }}>Moment: {a.event}</div>
            </div>
          ))}
        </Panel>

        {/* World rules — collapsed by default */}
        <Panel>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}
            onClick={() => setWorldRulesOpen(o => !o)}>
            <SectionLabel>World rules</SectionLabel>
            <span style={{ fontSize: 11, color: tokens.text3 }}>{worldRulesOpen ? "▲ collapse" : "▼ expand"}</span>
          </div>
          {!worldRulesOpen && (
            <div style={{ fontSize: 11, color: tokens.text3, marginTop: 4, fontStyle: "italic" }}>
              {sc.worldRules.length} rules — tap to expand
            </div>
          )}
          {worldRulesOpen && sc.worldRules.map((r, i) => (
            <div key={i} style={{ padding: "6px 0", borderBottom: `1px solid ${tokens.border}`, fontSize: 12, color: tokens.text2 }}>
              {r.title}
            </div>
          ))}
        </Panel>

      </div>
    </div>
  );
}

// ─── Narrative nav sidebar ────────────────────────────────────────────────────

const narrativeNavItems = [
  { id: "timeline", icon: "⟳", label: "Timeline" },
  { id: "write", icon: "✎", label: "Write" },
  { id: "dump", icon: "⊕", label: "Story Dump" },
  { id: "characters", icon: "◉", label: "Characters" },
  { id: "world", icon: "⬡", label: "World / Lore" },
  { id: "locations", icon: "⌖", label: "Locations" },
  { id: "themes", icon: "◈", label: "Themes" },
];

function NarrativeSidebar({ activeView, onSelect, accent, accentDim, accentGlow, onSceneContext, isMobile }) {
  const allItems = [...narrativeNavItems, { id: "scene", icon: "⊛", label: "Scene Context", isContext: true }];

  if (isMobile) {
    return (
      <div style={{
        display: "flex", overflowX: "auto", gap: 4,
        padding: "6px 10px",
        borderBottom: `1px solid ${tokens.border}`,
        flexShrink: 0,
        scrollbarWidth: "none",
        WebkitOverflowScrolling: "touch",
      }}>
        {allItems.map(item => (
          <button key={item.id} onClick={() => item.isContext ? onSceneContext() : onSelect(item.id)} style={{
            display: "flex", alignItems: "center", gap: 5,
            padding: "5px 10px", borderRadius: 4, flexShrink: 0,
            background: activeView === item.id ? (item.isContext ? `${accent}14` : accentGlow) : "none",
            border: `1px solid ${activeView === item.id || item.isContext ? accentDim : tokens.border}`,
            color: activeView === item.id || item.isContext ? accent : tokens.text2,
            fontSize: 11, fontWeight: activeView === item.id ? 600 : 400,
            cursor: "pointer", whiteSpace: "nowrap",
          }}>
            <span>{item.icon}</span>
            {item.label}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div style={{
      width: 130, flexShrink: 0,
      borderRight: `1px solid ${tokens.border}`,
      display: "flex", flexDirection: "column",
      padding: "12px 8px",
      gap: 2, overflowY: "auto",
    }}>
      {narrativeNavItems.map(item => (
        <button key={item.id} onClick={() => onSelect(item.id)} style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "8px 10px", borderRadius: 5,
          background: activeView === item.id ? accentGlow : "none",
          border: `1px solid ${activeView === item.id ? accentDim : "transparent"}`,
          color: activeView === item.id ? accent : tokens.text2,
          fontSize: 12, fontWeight: activeView === item.id ? 600 : 400,
          cursor: "pointer", textAlign: "left", width: "100%",
          transition: "all 0.1s ease",
        }}>
          <span style={{ fontSize: 13, flexShrink: 0 }}>{item.icon}</span>
          {item.label}
        </button>
      ))}
      <div style={{ height: 1, background: tokens.border, margin: "8px 0" }} />
      <button onClick={onSceneContext} style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "8px 10px", borderRadius: 5,
        background: `${accent}10`,
        border: `1px solid ${accentDim}`,
        color: accent,
        fontSize: 12, fontWeight: 600,
        cursor: "pointer", textAlign: "left", width: "100%",
      }}>
        <span style={{ fontSize: 13 }}>⊛</span>
        Scene Context
      </button>
    </div>
  );
}

function NarrativeCenter({ mode, data, narrativeView, setNarrativeView, sceneContextOpen, setSceneContextOpen, isMobile }) {
  const actColors = { "Act 1": tokens.blue, "Act 2": tokens.amber, "Act 3": tokens.rose };

  if (sceneContextOpen) {
    return (
      <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", height: "100%", minHeight: 0 }}>
        <NarrativeSidebar
          activeView={null}
          onSelect={v => { setNarrativeView(v); setSceneContextOpen(false); }}
          accent={mode.accent} accentDim={mode.accentDim} accentGlow={mode.accentGlow}
          onSceneContext={() => setSceneContextOpen(true)}
          isMobile={isMobile}
        />
        <div style={{ flex: 1, padding: isMobile ? "12px" : "0 0 0 16px", overflowY: "auto", minHeight: 0 }}>
          <SceneContextView mode={mode} data={data} onExit={() => setSceneContextOpen(false)} />
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", height: "100%", minHeight: 0 }}>
      <NarrativeSidebar
        activeView={narrativeView}
        onSelect={setNarrativeView}
        accent={mode.accent} accentDim={mode.accentDim} accentGlow={mode.accentGlow}
        onSceneContext={() => setSceneContextOpen(true)}
        isMobile={isMobile}
      />
      <div style={{ flex: 1, padding: isMobile ? "12px" : "0 0 0 16px", overflowY: "auto", minHeight: 0 }}>
      <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>

      {narrativeView === "write" && (
        <Panel style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <SectionLabel>Scratchpad</SectionLabel>
            <span style={{ fontSize: 10, color: tokens.text3 }}>autosaving</span>
          </div>
          <div style={{
            fontSize: 13, color: tokens.text1, lineHeight: 1.8,
            fontFamily: "'Georgia', serif",
            whiteSpace: "pre-wrap",
          }}>{data.scratchpad}</div>
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${tokens.border}`, display: "flex", gap: 8 }}>
            <span style={{ fontSize: 11, color: tokens.text3 }}>Promote to →</span>
            {["Scene node", "Permanent note", "Theme note"].map(t => (
              <button key={t} style={{
                fontSize: 11, padding: "3px 10px", borderRadius: 3,
                background: "none", border: `1px solid ${tokens.border}`,
                color: tokens.text2, cursor: "pointer",
              }}>{t}</button>
            ))}
          </div>
        </Panel>
      )}

      {narrativeView === "timeline" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 4 }}>
            {["Act 1", "Act 2", "Act 3"].map(act => (
              <div key={act} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <Dot color={actColors[act]} />
                <span style={{ fontSize: 11, color: tokens.text2 }}>{act}</span>
              </div>
            ))}
          </div>
          {data.events.map((ev, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "8px 12px", borderRadius: 5,
              background: tokens.bg2,
              border: `1px solid ${tokens.border}`,
            }}>
              <span style={{
                fontSize: 11, fontFamily: "monospace",
                color: tokens.text3, width: 20, flexShrink: 0,
              }}>{i + 1}</span>
              <Dot color={actColors[ev.act]} />
              <span style={{ fontSize: 12, color: tokens.text0, flex: 1 }}>{ev.title}</span>
              <Tag
                color={ev.status === "draft" ? mode.accent : tokens.text3}
                dim={ev.status === "draft" ? mode.accentDim : tokens.border}
              >{ev.status}</Tag>
              <span style={{ fontSize: 10, color: tokens.text3 }}>{ev.act}</span>
            </div>
          ))}
          <button style={{
            fontSize: 12, padding: "10px", borderRadius: 5,
            background: "none", border: `1px dashed ${tokens.border}`,
            color: tokens.text3, cursor: "pointer", textAlign: "center",
          }}>+ Add event / placeholder</button>
        </div>
      )}

      {narrativeView === "dump" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Panel style={{ background: `${mode.accent}06` }}>
            <div style={{ fontSize: 12, color: tokens.text1, lineHeight: 1.6, marginBottom: 12 }}>
              Write freely — character rants, story arc summaries, theme notes. Claude will extract proposed nodes for review.
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              {["Story arc", "Character", "Themes / subtext"].map(t => (
                <button key={t} style={{
                  fontSize: 11, padding: "4px 12px", borderRadius: 3,
                  background: "none", border: `1px solid ${tokens.border}`,
                  color: tokens.text2, cursor: "pointer",
                }}>{t}</button>
              ))}
            </div>
            <textarea style={{
              width: "100%", minHeight: 120, background: tokens.bg2,
              border: `1px solid ${tokens.border}`, borderRadius: 5,
              padding: "10px 12px", fontSize: 13, color: tokens.text1,
              lineHeight: 1.7, fontFamily: "'Georgia', serif",
              resize: "vertical", boxSizing: "border-box",
            }} placeholder="I know that Michael meets Leon at work. Actually he had a dream about him before that..." />
            <button style={{
              marginTop: 10, fontSize: 12, padding: "8px 16px", borderRadius: 5,
              background: mode.accentGlow, border: `1px solid ${mode.accentDim}`,
              color: mode.accent, cursor: "pointer",
            }}>Extract nodes →</button>
          </Panel>
        </div>
      )}

      {(narrativeView === "characters" || narrativeView === "world" || narrativeView === "locations" || narrativeView === "themes") && (
        <Panel style={{ flex: 1 }}>
          <SectionLabel>{narrativeNavItems.find(n => n.id === narrativeView)?.label}</SectionLabel>
          <div style={{ fontSize: 12, color: tokens.text3, fontStyle: "italic", padding: "20px 0", textAlign: "center" }}>
            {narrativeView === "characters" && "Character sheets — select a character or create a new one."}
            {narrativeView === "world" && "Lore library — history, world rules, secrets, power structures, social fabric."}
            {narrativeView === "locations" && "Location sheets — places where scenes happen, their atmosphere and lore connections."}
            {narrativeView === "themes" && "Theme nodes — motifs, metaphors, and the invisible structure of the story."}
          </div>
          <button style={{
            fontSize: 12, padding: "10px", borderRadius: 5, width: "100%",
            background: "none", border: `1px dashed ${tokens.border}`,
            color: mode.accent, cursor: "pointer",
          }}>+ Add {narrativeNavItems.find(n => n.id === narrativeView)?.label.split(" / ")[0].toLowerCase().replace("world", "lore note").replace("locations", "location")}</button>
        </Panel>
      )}

      </div>
      </div>
    </div>
  );
}

function LearningCenter({ mode, data }) {
  const [tab, setTab] = useState("map");
  const [completedSubs, setCompleted] = useState(
    data.learningMap.map(p => p.subTopics.map(s => s.complete))
  );

  const toggleSub = (pi, si) => {
    const next = completedSubs.map((p, i) => i === pi ? p.map((s, j) => j === si ? !s : s) : p);
    setCompleted(next);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${tokens.border}`, marginBottom: 16 }}>
        {["map", "read", "notes"].map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: "8px 16px", fontSize: 12, fontWeight: tab === t ? 600 : 400,
            color: tab === t ? mode.accent : tokens.text2,
            background: "none", border: "none", cursor: "pointer",
            borderBottom: tab === t ? `2px solid ${mode.accent}` : "2px solid transparent",
            marginBottom: -1, textTransform: "capitalize",
          }}>{t === "map" ? "Learning Map" : t === "read" ? "Sources" : "Notes"}</button>
        ))}
      </div>

      {tab === "map" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {data.learningMap.map((phase, pi) => {
            const isActive = phase.status === "active";
            const isLocked = phase.status === "locked";
            const doneCount = completedSubs[pi].filter(Boolean).length;
            return (
              <Panel key={pi} style={{
                opacity: isLocked ? 0.5 : 1,
                border: isActive ? `1px solid ${mode.accentDim}` : `1px solid ${tokens.border}`,
                background: isActive ? `${mode.accent}06` : tokens.bg1,
              }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{
                      fontSize: 10, fontWeight: 700, fontFamily: "monospace",
                      color: isActive ? mode.accent : tokens.text3,
                    }}>Phase {phase.phase}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: tokens.text0 }}>{phase.title}</span>
                    {isActive && <Tag color={mode.accent} dim={mode.accentDim}>Active</Tag>}
                  </div>
                  <span style={{ fontSize: 11, color: tokens.text3, fontFamily: "monospace" }}>
                    {doneCount}/{phase.subTopics.length}
                  </span>
                </div>
                {phase.subTopics.map((sub, si) => (
                  <div key={si}
                    onClick={() => !isLocked && toggleSub(pi, si)}
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      padding: "5px 0",
                      borderBottom: si < phase.subTopics.length - 1 ? `1px solid ${tokens.border}` : "none",
                      cursor: isLocked ? "default" : "pointer",
                    }}>
                    <div style={{
                      width: 14, height: 14, borderRadius: 2,
                      border: `1px solid ${completedSubs[pi][si] ? mode.accent : tokens.border}`,
                      background: completedSubs[pi][si] ? mode.accent : "none",
                      flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      {completedSubs[pi][si] && <span style={{ fontSize: 9, color: tokens.bg0 }}>✓</span>}
                    </div>
                    <span style={{
                      fontSize: 12, color: completedSubs[pi][si] ? tokens.text3 : tokens.text1,
                      textDecoration: completedSubs[pi][si] ? "line-through" : "none",
                    }}>{sub.title}</span>
                  </div>
                ))}
                {isActive && (
                  <div style={{ marginTop: 10, fontSize: 11, color: tokens.text2, lineHeight: 1.5 }}>
                    <span style={{ color: tokens.text3 }}>Goal: </span>{phase.goal}
                  </div>
                )}
              </Panel>
            );
          })}
        </div>
      )}

      {tab === "notes" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {data.notes.map((n, i) => (
            <Panel key={i} style={{ border: n.verified ? `1px solid ${mode.accentDim}` : `1px solid ${tokens.border}` }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: tokens.text0 }}>{n.title}</span>
                {n.verified && <Tag color={mode.accent} dim={mode.accentDim}>✓ Verified</Tag>}
              </div>
              <div style={{ fontSize: 12, color: tokens.text1, lineHeight: 1.6 }}>{n.content}</div>
              <div style={{ marginTop: 8, fontSize: 10, color: tokens.text3 }}>
                Phase {n.phase} · {n.subTopic}
              </div>
            </Panel>
          ))}
          <Panel>
            <SectionLabel>Scratchpad</SectionLabel>
            <div style={{ fontSize: 12, color: tokens.text1, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
              {data.scratchpad}
            </div>
          </Panel>
        </div>
      )}

      {tab === "read" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {data.learningMap.filter(p => p.status === "active").map((phase, i) => (
            <Panel key={i} style={{ border: `1px solid ${mode.accentDim}` }}>
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 11, color: mode.accent, marginBottom: 4 }}>Phase {phase.phase} — {phase.title}</div>
                <div style={{ fontSize: 13, color: tokens.text0 }}>{phase.source}</div>
              </div>
              <div style={{
                padding: "8px 12px", borderRadius: 4,
                background: `${mode.accent}0a`, border: `1px solid ${mode.accentDim}`,
                fontSize: 11, color: tokens.text1, lineHeight: 1.6,
              }}>
                <span style={{ color: mode.accent, fontWeight: 600 }}>Pay attention to: </span>
                How encoders convert physical rotation to digital pulses — specifically why Gray code prevents counting errors at position boundaries. This directly addresses your uncertainty about how position is tracked.
              </div>
              <button style={{
                marginTop: 10, fontSize: 12, padding: "6px 16px", borderRadius: 4,
                background: mode.accentGlow, border: `1px solid ${mode.accentDim}`,
                color: mode.accent, cursor: "pointer",
              }}>Launch source ↗</button>
            </Panel>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Right panels ─────────────────────────────────────────────────────────────

function ResearchRight({ mode, data }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <Panel>
        <SectionLabel>Bridges in scope</SectionLabel>
        {data.rightPanel.bridges.map((b, i) => (
          <div key={i} style={{
            padding: "8px 0",
            borderBottom: i < data.rightPanel.bridges.length - 1 ? `1px solid ${tokens.border}` : "none",
          }}>
            <div style={{ fontSize: 12, color: tokens.text0, marginBottom: 3 }}>
              {b.a} <span style={{ color: tokens.text3 }}>↔</span> {b.b}
            </div>
            <div style={{ fontSize: 11, color: tokens.text3 }}>{b.sim} similarity</div>
          </div>
        ))}
      </Panel>
      <Panel>
        <SectionLabel>Session activity</SectionLabel>
        {data.rightPanel.recentActivity.map((a, i) => (
          <div key={i} style={{
            display: "flex", gap: 8, padding: "5px 0",
            borderBottom: i < data.rightPanel.recentActivity.length - 1 ? `1px solid ${tokens.border}` : "none",
          }}>
            <span style={{ fontSize: 11, color: tokens.text3, flexShrink: 0 }}>{a.verb}</span>
            <span style={{ fontSize: 12, color: tokens.text1 }}>{a.title}</span>
          </div>
        ))}
      </Panel>
    </div>
  );
}

function NarrativeRight({ mode, data }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <Panel>
        <SectionLabel>Open questions</SectionLabel>
        {data.rightPanel.openQuestions.map((q, i) => (
          <div key={i} style={{
            display: "flex", gap: 8, padding: "6px 0",
            borderBottom: i < data.rightPanel.openQuestions.length - 1 ? `1px solid ${tokens.border}` : "none",
            alignItems: "flex-start",
          }}>
            <span style={{ color: mode.accent, fontSize: 13, flexShrink: 0 }}>?</span>
            <span style={{ fontSize: 12, color: tokens.text1, lineHeight: 1.5 }}>{q}</span>
          </div>
        ))}
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${tokens.border}` }}>
          <input style={{
            width: "100%", background: tokens.bg2, border: `1px solid ${tokens.border}`,
            borderRadius: 4, padding: "5px 8px", fontSize: 12, color: tokens.text1,
            boxSizing: "border-box",
          }} placeholder="Add a question…" />
        </div>
      </Panel>
      <Panel>
        <SectionLabel>Theme activity</SectionLabel>
        {data.rightPanel.themeActivity.map((a, i) => (
          <div key={i} style={{
            display: "flex", gap: 8, padding: "5px 0", alignItems: "flex-start",
            borderBottom: i < data.rightPanel.themeActivity.length - 1 ? `1px solid ${tokens.border}` : "none",
          }}>
            <span style={{ color: mode.accent, fontSize: 10, marginTop: 2 }}>◈</span>
            <span style={{ fontSize: 12, color: tokens.text1, lineHeight: 1.5 }}>
              <span style={{ color: mode.accent }}>{a.theme}</span> {a.action} to {a.event}
            </span>
          </div>
        ))}
      </Panel>
    </div>
  );
}

function LearningRight({ mode, data }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <Panel>
        <SectionLabel>Source coverage</SectionLabel>
        {data.rightPanel.coverage.map((c, i) => (
          <div key={i} style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontSize: 11, color: tokens.text1 }}>{c.topic}</span>
              <span style={{ fontSize: 10, color: tokens.text3, fontFamily: "monospace" }}>
                {c.notes} notes
              </span>
            </div>
            <div style={{ height: 3, background: tokens.bg3, borderRadius: 2, overflow: "hidden" }}>
              <div style={{
                height: "100%", borderRadius: 2,
                background: c.sources > 0 ? mode.accent : tokens.border,
                width: c.sources > 0 ? "100%" : "0%",
              }} />
            </div>
            {c.sources === 0 && (
              <div style={{ fontSize: 10, color: tokens.rose, marginTop: 3 }}>No source linked</div>
            )}
          </div>
        ))}
      </Panel>
      {data.rightPanel.auditReady && (
        <Panel style={{ border: `1px solid ${mode.accentDim}`, background: mode.accentGlow }}>
          <SectionLabel>Audit ready</SectionLabel>
          <div style={{ fontSize: 12, color: tokens.text1, lineHeight: 1.5, marginBottom: 10 }}>
            You have 1 manually captured note. Run an audit to check for gaps.
          </div>
          <button style={{
            fontSize: 12, padding: "7px 14px", borderRadius: 4, width: "100%",
            background: mode.accentGlow, border: `1px solid ${mode.accentDim}`,
            color: mode.accent, cursor: "pointer",
          }}>Audit my Learning →</button>
        </Panel>
      )}
    </div>
  );
}

// ─── Main workspace ───────────────────────────────────────────────────────────


// ─── Collapse helpers ─────────────────────────────────────────────────────────

function CollapseBtn({ side, collapsed, onClick, accent }) {
  return (
    <button onClick={onClick} title={collapsed ? `Expand ${side} panel` : `Collapse ${side} panel`}
      style={{
        position: "absolute", top: "50%",
        [side === "left" ? "right" : "left"]: -13,
        transform: "translateY(-50%)",
        width: 26, height: 26, borderRadius: "50%",
        background: "#1a1a1c", border: "1px solid #2e2e33",
        color: accent, fontSize: 11, cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 20, lineHeight: 1, padding: 0,
      }}>
      {side === "left" ? (collapsed ? "›" : "‹") : (collapsed ? "‹" : "›")}
    </button>
  );
}

function IconRail({ icons, accent }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 16, gap: 2 }}>
      {icons.map((item, i) => (
        <div key={i} title={item.label} style={{
          width: 38, height: 38, borderRadius: 6,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 13, color: accent, opacity: 0.5, cursor: "pointer",
          transition: "opacity 0.15s",
        }}
          onMouseEnter={e => e.currentTarget.style.opacity = "1"}
          onMouseLeave={e => e.currentTarget.style.opacity = "0.5"}
        >{item.icon}</div>
      ))}
    </div>
  );
}

const leftIcons = {
  research: [{ icon: "◎", label: "Goals" }, { icon: "⊞", label: "Sub-topics" }, { icon: "⌥", label: "Corpus" }],
  narrative: [{ icon: "◉", label: "Characters" }, { icon: "◈", label: "Themes" }],
  learning: [{ icon: "▣", label: "Progress" }, { icon: "⚡", label: "Corrections" }],
};
const rightIcons = {
  research: [{ icon: "⬡", label: "Bridges" }, { icon: "◷", label: "Activity" }],
  narrative: [{ icon: "?", label: "Questions" }, { icon: "◈", label: "Themes" }],
  learning: [{ icon: "▦", label: "Coverage" }, { icon: "✓", label: "Audit" }],
};

export default function ConstellationWorkspace() {
  const [activeMode, setActiveMode] = useState("research");
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [narrativeView, setNarrativeView] = useState("timeline");
  const [sceneContextOpen, setSceneContextOpen] = useState(false);
  const [askOpen, setAskOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const mode = modes[activeMode];
  const data = modes[activeMode];

  useEffect(() => {
    const check = () => {
      const mobile = window.innerWidth < 640;
      setIsMobile(mobile);
      if (mobile) { setLeftOpen(false); setRightOpen(false); }
      else { setLeftOpen(true); setRightOpen(true); }
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const [demoSession, setDemoSession] = useState(1);
  const leftW = leftOpen ? 220 : 46;
  const rightW = rightOpen ? 220 : 46;

  // Override sessionNum for demo purposes
  const effectiveData = activeMode === "learning"
    ? { ...data, sessionNum: demoSession }
    : data;

  return (
    <div style={{
      background: tokens.bg0,
      height: "100vh",
      display: "flex",
      flexDirection: "column",
      fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif",
      color: tokens.text0,
      overflow: "hidden",
    }}>
      {/* Google Fonts */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,300;1,9..40,400&family=DM+Mono:wght@300;400;500&display=swap');
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #333; border-radius: 2px; }
        button { font-family: inherit; }
        input, textarea { font-family: inherit; outline: none; }
        textarea::placeholder, input::placeholder { color: #524f4a; }
      `}</style>

      {/* Mode selector bar — compact */}
      <div style={{
        display: "flex", alignItems: "center",
        padding: "0 12px",
        background: tokens.bg1,
        borderBottom: `1px solid ${tokens.border}`,
        height: 40, flexShrink: 0, gap: 2, overflow: "hidden",
      }}>
        {!isMobile && <div style={{
          fontSize: 10, fontWeight: 700, letterSpacing: "0.14em",
          color: tokens.text3, textTransform: "uppercase",
          marginRight: 10, fontFamily: "'DM Mono', monospace", flexShrink: 0,
        }}>Constellation</div>}

        {Object.values(modes).map(m => (
          <button key={m.id} onClick={() => setActiveMode(m.id)} style={{
            display: "flex", alignItems: "center", gap: 5,
            padding: isMobile ? "5px 10px" : "5px 12px", borderRadius: 4,
            background: activeMode === m.id ? `${m.accent}14` : "none",
            border: `1px solid ${activeMode === m.id ? m.accentDim : "transparent"}`,
            color: activeMode === m.id ? m.accent : tokens.text2,
            fontSize: isMobile ? 12 : 12, fontWeight: activeMode === m.id ? 600 : 400,
            cursor: "pointer", transition: "all 0.15s ease", flexShrink: 0,
          }}>
            <span style={{ fontSize: 12 }}>{m.icon}</span>
            {m.label}
          </button>
        ))}

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 5,
            padding: "3px 10px", borderRadius: 20,
            background: `${mode.accent}14`, border: `1px solid ${mode.accentDim}`,
            fontSize: 10, color: mode.accent, fontWeight: 500,
          }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: mode.accent }} />
            {isMobile ? `S${data.sessionNum}` : `Session ${data.sessionNum}`}
          </div>
          {!isMobile && <button style={{
            fontSize: 11, padding: "4px 10px", borderRadius: 4,
            background: `${mode.accent}18`, border: `1px solid ${mode.accentDim}`,
            color: mode.accent, cursor: "pointer", fontWeight: 500,
          }}>Resume briefing</button>}
        </div>
      </div>

      {/* Project header — compact */}
      <div style={{
        padding: "8px 14px",
        background: tokens.bg1,
        borderBottom: `1px solid ${tokens.border}`,
        display: "flex", alignItems: "center", gap: 10, flexShrink: 0,
      }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 1 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: tokens.text0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{data.tagline}</span>
            <Tag color={mode.accent} dim={mode.accentDim}>{mode.label}</Tag>
          </div>
          <div style={{ fontSize: 11, color: tokens.text3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            S{data.sessionNum} · {data.sessionIntent}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexShrink: 0, alignItems: "center" }}>
          {activeMode === "learning" && (
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              {[1,2,3].map(s => (
                <button key={s} onClick={() => setDemoSession(s)} style={{
                  fontSize: 10, padding: "2px 7px", borderRadius: 3,
                  background: demoSession === s ? `${mode.accent}18` : "none",
                  border: `1px solid ${demoSession === s ? mode.accentDim : tokens.border}`,
                  color: demoSession === s ? mode.accent : tokens.text3,
                  cursor: "pointer",
                }}>S{s}</button>
              ))}
            </div>
          )}
          {!isMobile && <button style={{
            fontSize: 11, padding: "4px 10px", borderRadius: 4,
            background: "none", border: `1px solid ${tokens.border}`,
            color: tokens.text2, cursor: "pointer",
          }}>Graph ↗</button>}
          <button style={{
            fontSize: 11, padding: "4px 10px", borderRadius: 4,
            background: "none", border: `1px solid ${tokens.border}`,
            color: tokens.text2, cursor: "pointer",
          }}>End</button>
        </div>
      </div>

      {/* Ask bar — collapsible on mobile */}
      {isMobile ? (
        <div style={{ padding: "6px 12px", background: tokens.bg0, borderBottom: `1px solid ${tokens.border}`, flexShrink: 0 }}>
          {askOpen ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{
                flex: 1, display: "flex", alignItems: "center", gap: 8,
                background: tokens.bg2, border: `1px solid ${tokens.border}`,
                borderRadius: 6, padding: "7px 12px",
              }}>
                <span style={{ fontSize: 13, color: tokens.text3 }}>⌕</span>
                <span style={{ fontSize: 12, color: tokens.text3 }}>Ask about this project…</span>
              </div>
              <button onClick={() => setAskOpen(false)} style={{
                fontSize: 11, padding: "5px 10px", borderRadius: 4,
                background: "none", border: `1px solid ${tokens.border}`,
                color: tokens.text3, cursor: "pointer",
              }}>✕</button>
            </div>
          ) : (
            <button onClick={() => setAskOpen(true)} style={{
              display: "flex", alignItems: "center", gap: 8, width: "100%",
              padding: "7px 12px", borderRadius: 6,
              background: tokens.bg2, border: `1px solid ${tokens.border}`,
              color: tokens.text3, fontSize: 12, cursor: "pointer",
            }}>
              <span>⌕</span>
              <span>Ask about this project…</span>
              <span style={{ marginLeft: "auto", color: mode.accent, fontSize: 10 }}>⊙ {mode.label}</span>
            </button>
          )}
        </div>
      ) : (
        <div style={{
          padding: "8px 16px",
          background: tokens.bg0,
          borderBottom: `1px solid ${tokens.border}`,
          display: "flex", alignItems: "center", gap: 8, flexShrink: 0,
        }}>
          <div style={{
            flex: 1, display: "flex", alignItems: "center", gap: 10,
            background: tokens.bg2, border: `1px solid ${tokens.border}`,
            borderRadius: 6, padding: "6px 12px",
          }}>
            <span style={{ fontSize: 13, color: tokens.text3 }}>⌕</span>
            <span style={{ fontSize: 12, color: tokens.text3 }}>Ask anything about this project…</span>
          </div>
          <div style={{
            fontSize: 11, padding: "5px 10px", borderRadius: 20,
            background: tokens.bg2, border: `1px solid ${tokens.border}`,
            color: tokens.text2, cursor: "pointer",
            display: "flex", alignItems: "center", gap: 4,
          }}>⊙ Scoped</div>
          <div style={{
            fontSize: 11, padding: "5px 10px", borderRadius: 20,
            background: tokens.bg2, border: `1px solid ${tokens.border}`,
            color: tokens.text3, cursor: "pointer",
          }}>Full corpus</div>
        </div>
      )}

      {/* Three-panel body */}
      <div style={{
        display: "grid",
        gridTemplateColumns: `${leftW}px 1fr ${rightW}px`,
        gap: 0,
        flex: 1,
        minHeight: 0,
        overflow: "hidden",
        transition: "grid-template-columns 0.25s ease",
      }}>
        {/* Left panel */}
        <div style={{
          borderRight: `1px solid ${tokens.border}`,
          overflowY: leftOpen ? "auto" : "hidden",
          overflowX: "hidden",
          background: tokens.bg0,
          position: "relative",
          transition: "width 0.25s ease",
          minHeight: 0,
        }}>
          <CollapseBtn side="left" collapsed={!leftOpen} onClick={() => setLeftOpen(o => !o)} accent={mode.accent} />
          {leftOpen ? (
            <div style={{ padding: "16px 14px" }}>
              {activeMode === "research" && <ResearchLeft mode={mode} data={effectiveData} />}
              {activeMode === "narrative" && <NarrativeLeft mode={mode} data={effectiveData} />}
              {activeMode === "learning" && <LearningLeft mode={mode} data={effectiveData} />}
            </div>
          ) : (
            <IconRail icons={leftIcons[activeMode]} accent={mode.accent} />
          )}
        </div>

        {/* Center panel */}
        <div style={{
          padding: "16px 20px",
          overflowY: "auto",
          background: tokens.bg0,
          minWidth: 0,
          minHeight: 0,
        }}>
          {activeMode === "research" && <ResearchCenter mode={mode} data={effectiveData} />}
          {activeMode === "narrative" && <NarrativeCenter mode={mode} data={effectiveData} narrativeView={narrativeView} setNarrativeView={setNarrativeView} sceneContextOpen={sceneContextOpen} setSceneContextOpen={setSceneContextOpen} isMobile={isMobile} />}
          {activeMode === "learning" && <LearningCenter mode={mode} data={effectiveData} />}
        </div>

        {/* Right panel */}
        <div style={{
          borderLeft: `1px solid ${tokens.border}`,
          overflowY: rightOpen ? "auto" : "hidden",
          overflowX: "hidden",
          background: tokens.bg0,
          position: "relative",
          transition: "width 0.25s ease",
          minHeight: 0,
        }}>
          <CollapseBtn side="right" collapsed={!rightOpen} onClick={() => setRightOpen(o => !o)} accent={mode.accent} />
          {rightOpen ? (
            <div style={{ padding: "16px 14px" }}>
              {activeMode === "research" && <ResearchRight mode={mode} data={effectiveData} />}
              {activeMode === "narrative" && <NarrativeRight mode={mode} data={effectiveData} />}
              {activeMode === "learning" && <LearningRight mode={mode} data={effectiveData} />}
            </div>
          ) : (
            <IconRail icons={rightIcons[activeMode]} accent={mode.accent} />
          )}
        </div>
      </div>
    </div>
  );
}
