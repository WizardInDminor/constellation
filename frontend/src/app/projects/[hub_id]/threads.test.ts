import { describe, expect, it } from "vitest";

import { type ThreadsLike, threadsIsEmpty, threadsTotal } from "./threads";

function threads(over: Partial<ThreadsLike> = {}): ThreadsLike {
  return {
    open_questions: [],
    pending_payoffs: [],
    unresolved_tensions: [],
    ...over,
  };
}

describe("threadsTotal", () => {
  it("sums all three buckets", () => {
    expect(
      threadsTotal(
        threads({
          open_questions: [1, 2],
          pending_payoffs: [3],
          unresolved_tensions: [4, 5, 6],
        }),
      ),
    ).toBe(6);
  });
});

describe("threadsIsEmpty", () => {
  it("is true only when every bucket is empty", () => {
    expect(threadsIsEmpty(threads())).toBe(true);
    expect(threadsIsEmpty(threads({ pending_payoffs: [1] }))).toBe(false);
  });
});
