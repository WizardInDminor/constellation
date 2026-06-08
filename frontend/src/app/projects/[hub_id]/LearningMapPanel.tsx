"use client";

/**
 * Learning map panel — generates a phased learning plan via the
 * `/projects/{hub_id}/learning-map` endpoint (ADR-070). Sources are
 * marked "Suggested — not verified" until the user confirms them.
 *
 * Surfaces in the center panel when project mode is `learning`.
 */

import { useState } from "react";
import { generateLearningMap } from "@/lib/api";
import type { LearningMapResponse, ProjectScope } from "@/lib/api";

interface Props {
  scope: ProjectScope;
}

export function LearningMapPanel({ scope }: Props) {
  const [topic, setTopic] = useState(scope.briefing_prompt ?? "");
  const [generating, setGenerating] = useState(false);
  const [map, setMap] = useState<LearningMapResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    if (!topic.trim() || generating) return;
    setGenerating(true);
    setError(null);
    setMap(null);
    try {
      const result = await generateLearningMap(scope.hub_node_id, {
        topic: topic.trim(),
        prior_knowledge: scope.prior_knowledge ?? null,
        goals: [],
      });
      setMap(result);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Failed to generate learning map",
      );
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="section-label">Learning map</h2>
        <p className="text-xs text-gray-500 mt-1">
          Generates a phased plan with web-researched free sources. Suggested
          sources are not verified — confirm or replace each one before relying
          on it (ADR-070).
        </p>
      </div>

      <div className="space-y-2">
        <label htmlFor="learning-map-topic" className="sr-only">
          Learning topic
        </label>
        <input
          id="learning-map-topic"
          type="text"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="Topic — e.g. Motor encoders, Pandas groupby, control theory"
          className="input"
        />
        {scope.prior_knowledge && (
          <p className="field-hint">
            Prior-knowledge entry will be passed to the planner.
          </p>
        )}
        <button
          onClick={handleGenerate}
          disabled={generating || !topic.trim()}
          className="btn btn-primary btn-sm"
        >
          {generating ? "Researching…" : "Generate learning map"}
        </button>
      </div>

      {error && <div className="alert-error">{error}</div>}

      {map && (
        <div className="space-y-4">
          {map.warnings.length > 0 && (
            <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {map.warnings.map((w, i) => (
                <p key={i}>{w}</p>
              ))}
            </div>
          )}
          <ol className="space-y-3">
            {map.phases.map((phase, i) => (
              <li key={i} className="card px-4 py-3">
                <h3 className="text-sm font-semibold text-gray-900 mb-2">
                  Phase {i + 1}: {phase.name}
                </h3>
                {phase.goals.length > 0 && (
                  <ul className="list-disc list-inside text-xs text-gray-600 mb-3 space-y-0.5">
                    {phase.goals.map((g, j) => (
                      <li key={j}>{g}</li>
                    ))}
                  </ul>
                )}
                {phase.sources.length > 0 && (
                  <div>
                    <p className="section-label mb-1.5">Sources</p>
                    <ul className="space-y-2">
                      {phase.sources.map((s) => (
                        <li
                          key={s.source_id}
                          className="text-xs border-l-2 border-amber-200 pl-2"
                        >
                          <div className="flex items-center gap-2 flex-wrap">
                            {s.url ? (
                              <a
                                href={s.url}
                                target="_blank"
                                rel="noopener"
                                className="text-indigo-600 hover:underline truncate"
                              >
                                {s.title}
                              </a>
                            ) : (
                              <span className="text-gray-700 truncate">
                                {s.title}
                              </span>
                            )}
                            <span className="badge shrink-0 bg-amber-100 text-amber-800">
                              Suggested — not verified
                            </span>
                          </div>
                          {s.reasoning && (
                            <p className="text-[11px] text-gray-500 mt-0.5">
                              {s.reasoning}
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
