import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createVisibilityPoller } from "./usePollWhileVisible";

describe("createVisibilityPoller", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("fires the callback on the interval while visible", () => {
    const callback = vi.fn();
    const poller = createVisibilityPoller({
      callback,
      intervalMs: 1000,
      isHidden: () => false,
    });
    poller.start();

    vi.advanceTimersByTime(3500);
    expect(callback).toHaveBeenCalledTimes(3);
    poller.stop();
  });

  it("does not arm the interval if the page starts hidden", () => {
    const callback = vi.fn();
    const poller = createVisibilityPoller({
      callback,
      intervalMs: 1000,
      isHidden: () => true,
    });
    poller.start();

    vi.advanceTimersByTime(5000);
    expect(callback).not.toHaveBeenCalled();
    poller.stop();
  });

  it("pauses when visibility changes to hidden and resumes when visible", () => {
    const callback = vi.fn();
    let hidden = false;
    const poller = createVisibilityPoller({
      callback,
      intervalMs: 1000,
      isHidden: () => hidden,
    });
    poller.start();

    vi.advanceTimersByTime(2500);
    expect(callback).toHaveBeenCalledTimes(2);

    hidden = true;
    poller.notifyVisibilityChange();
    vi.advanceTimersByTime(5000);
    expect(callback).toHaveBeenCalledTimes(2);

    hidden = false;
    poller.notifyVisibilityChange();
    vi.advanceTimersByTime(2000);
    expect(callback).toHaveBeenCalledTimes(4);

    poller.stop();
  });

  it("stop() prevents further callbacks", () => {
    const callback = vi.fn();
    const poller = createVisibilityPoller({
      callback,
      intervalMs: 1000,
      isHidden: () => false,
    });
    poller.start();
    vi.advanceTimersByTime(1500);
    poller.stop();
    vi.advanceTimersByTime(5000);
    expect(callback).toHaveBeenCalledTimes(1);
  });
});
