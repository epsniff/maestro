import { create } from "zustand";
import { getCodexUsage, type UsageData } from "@/lib/usageParser";

/** Default polling interval for usage updates (60 seconds). */
const POLL_INTERVAL_MS = 60_000;

/** Max polling interval after repeated errors (5 minutes). */
const MAX_POLL_INTERVAL_MS = 300_000;

interface CodexUsageState {
  /** Raw usage data from backend. */
  usage: UsageData | null;
  /** Whether a fetch is in progress. */
  isLoading: boolean;
  /** Last error message, if any. */
  error: string | null;
  /** Timestamp of last successful fetch. */
  lastFetch: Date | null;
  /** Whether authentication is needed. */
  needsAuth: boolean;

  // Actions
  /** Fetch usage data from backend. */
  fetchUsage: () => Promise<void>;
  /** Start polling for usage updates. Returns cleanup function. */
  startPolling: () => () => void;
}

/** Tracks the single active polling timeout across all component mounts. */
let globalTimeoutId: ReturnType<typeof setTimeout> | null = null;
/** Number of components currently subscribed to polling. */
let pollingRefCount = 0;
/** Consecutive error count for backoff. */
let consecutiveErrors = 0;

/**
 * Zustand store for Codex usage tracking.
 *
 * Polling is ref-counted: multiple mounts share one interval,
 * and it is cleared only when the last subscriber unmounts.
 */
export const useCodexUsageStore = create<CodexUsageState>()((set, get) => ({
  usage: null,
  isLoading: false,
  error: null,
  lastFetch: null,
  needsAuth: false,

  fetchUsage: async () => {
    if (get().isLoading) return;

    set({ isLoading: true, error: null });

    try {
      const usage = await getCodexUsage();
      const needsAuth = usage.needsAuth;

      const hasError = !needsAuth && !!usage.errorMessage;
      if (hasError) {
        consecutiveErrors++;
      } else {
        consecutiveErrors = 0;
      }

      set({
        usage,
        needsAuth,
        isLoading: false,
        lastFetch: new Date(),
        error: needsAuth ? null : usage.errorMessage,
      });
    } catch (err) {
      console.error("Failed to fetch Codex usage:", err);
      consecutiveErrors++;
      set({
        error: String(err),
        isLoading: false,
      });
    }
  },

  startPolling: () => {
    pollingRefCount++;

    if (pollingRefCount === 1) {
      get().fetchUsage();

      const scheduleNext = () => {
        const backoffMs =
          consecutiveErrors > 0
            ? Math.min(POLL_INTERVAL_MS * 2 ** consecutiveErrors, MAX_POLL_INTERVAL_MS)
            : POLL_INTERVAL_MS;

        globalTimeoutId = setTimeout(() => {
          get().fetchUsage();
          scheduleNext();
        }, backoffMs);
      };

      scheduleNext();
    }

    return () => {
      pollingRefCount = Math.max(0, pollingRefCount - 1);
      if (pollingRefCount === 0 && globalTimeoutId) {
        clearTimeout(globalTimeoutId);
        globalTimeoutId = null;
        consecutiveErrors = 0;
      }
    };
  },
}));
