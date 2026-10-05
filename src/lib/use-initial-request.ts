"use client";
import { useEffect } from "react";

// Defer subscription startup until after the commit. Cleanup cancels both the
// scheduled request (including Strict Mode's first setup) and in-flight fetches.
export function useInitialRequest(request: (signal: AbortSignal) => Promise<void>) {
  useEffect(() => {
    const controller = new AbortController();
    const task = setTimeout(() => { void request(controller.signal); }, 0);
    return () => { clearTimeout(task); controller.abort(); };
  }, [request]);
}
