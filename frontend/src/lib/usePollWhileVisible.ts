"use client";

import { useEffect, useRef } from "react";

export interface VisibilityPollerOptions {
  callback: () => void;
  intervalMs: number;
  isHidden: () => boolean;
}

export interface VisibilityPoller {
  start(): void;
  stop(): void;
  notifyVisibilityChange(): void;
}

export function createVisibilityPoller({
  callback,
  intervalMs,
  isHidden,
}: VisibilityPollerOptions): VisibilityPoller {
  let handle: ReturnType<typeof setInterval> | null = null;

  function clear() {
    if (handle !== null) {
      clearInterval(handle);
      handle = null;
    }
  }

  function arm() {
    clear();
    handle = setInterval(callback, intervalMs);
  }

  return {
    start() {
      if (!isHidden()) arm();
    },
    stop() {
      clear();
    },
    notifyVisibilityChange() {
      if (isHidden()) clear();
      else if (handle === null) arm();
    },
  };
}

export function usePollWhileVisible(callback: () => void, intervalMs: number) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    const poller = createVisibilityPoller({
      callback: () => callbackRef.current(),
      intervalMs,
      isHidden: () => document.visibilityState === "hidden",
    });
    poller.start();
    function onVisibilityChange() {
      poller.notifyVisibilityChange();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      poller.stop();
    };
  }, [intervalMs]);
}
