// src/utils/autoSolveResultsCopy.ts

type SolverMode = "exhaustive" | "balanced" | "fast";
type StopReason = "solution" | "timeout" | "complete" | "canceled" | "limit" | "error";

export type ResultsCopy = {
  title: string;
  subtitle?: string;
  truthLabel: string;
  body: string;
  tailNote?: string;
  suggestions: string[];
  actions: {
    primary: { label: string; action: "runAgain" | "close" };
    secondary: Array<{ label: string; action: "switchMode"; mode: SolverMode }>;
    utility: Array<{ label: string; action: "exportCSV" | "clearStats" | "close" }>;
  };
};

export function getAutoSolveResultsCopy(args: {
  mode: SolverMode;
  stopReason: StopReason;
  success: boolean;
  tailTriggered?: boolean;
}): ResultsCopy {
  const { mode, stopReason, success, tailTriggered } = args;

  // Truth labels
  const truthLabels: Record<SolverMode, string> = {
    exhaustive: "High coverage",
    balanced: "Best trade-off",
    fast: "Fast exploration",
  };

  // Title based on outcome
  let title: string;
  if (success) {
    title = "✅ Solution found";
  } else if (stopReason === "timeout") {
    title = "⏱️ No solution found in the allotted time";
  } else if (stopReason === "complete") {
    title = "❌ Search completed with no solution found";
  } else if (stopReason === "canceled") {
    title = "⛔ Search canceled";
  } else {
    title = "⚠️ Search stopped";
  }

  // Body paragraphs
  let body: string;
  if (mode === "exhaustive") {
    if (success) {
      body = "Exhaustive mode searches one path thoroughly without restarting or skipping ahead. This run found a solution by continuing steadily until the puzzle could be completed.";
    } else if (stopReason === "complete") {
      body = "Exhaustive mode is designed for high coverage. It avoids restarts and avoids randomness that could skip possibilities. If it finishes with no solution, that result is meaningful within the solver's current rules and piece set.";
    } else {
      body = "Exhaustive mode prioritizes coverage over speed. If you want faster exploration, try Balanced with restarts, or increase the timeout.";
    }
  } else if (mode === "balanced") {
    if (success) {
      body = "Balanced mode explores multiple promising regions. It uses controlled randomness and optional restarts to avoid getting stuck in one part of the search. A solution was found in one of these regions.";
    } else {
      body = "Balanced mode does not guarantee full coverage. Restarts start the search over and do not \"remember\" which parts were already explored. If you believe a solution exists, try Exhaustive for higher confidence.";
    }
  } else {
    // fast
    if (success) {
      body = "Fast mode samples the search space aggressively. It's designed to try many different starts quickly. Great for finding some solution fast, but not meant for guarantees.";
    } else {
      body = "Fast mode does not prove anything. It intentionally skips large parts of the search space to explore variety quickly. If you want reliability, switch to Balanced or Exhaustive.";
    }
  }

  // Tail note
  let tailNote: string | undefined;
  if (tailTriggered === true) {
    tailNote = "Endgame turbo activated: When the remaining open cells became small, the solver switched to a fast exact-cover endgame search to finish efficiently.";
  } else if (tailTriggered === false && !success) {
    tailNote = "Endgame turbo did not activate in this run. The search did not reach the small \"endgame\" threshold before stopping.";
  }

  // Suggestions
  let suggestions: string[];
  if (success) {
    suggestions = [
      "Run again to look for another solution.",
      "Export stats (CSV) if you're comparing modes.",
    ];
  } else if (mode === "fast") {
    suggestions = [
      "Run again with a new seed.",
      "Try Balanced for better consistency.",
      "Try Exhaustive for maximum confidence.",
    ];
  } else if (mode === "balanced") {
    suggestions = [
      "Increase timeout if the puzzle is hard.",
      "Try Exhaustive to avoid missing solutions.",
      "Try Fast if you want more variety quickly.",
    ];
  } else {
    // exhaustive
    suggestions = [
      "Increase timeout (Exhaustive can be slow).",
      "Try Balanced to explore alternative regions sooner.",
    ];
  }

  // Actions
  const secondary: Array<{ label: string; action: "switchMode"; mode: SolverMode }> = [];
  if (mode !== "balanced") {
    secondary.push({ label: "Try Balanced", action: "switchMode", mode: "balanced" });
  }
  if (mode !== "exhaustive" && !success) {
    secondary.push({ label: "Try Exhaustive", action: "switchMode", mode: "exhaustive" });
  }
  if (mode !== "fast") {
    secondary.push({ label: "Try Fast", action: "switchMode", mode: "fast" });
  }

  return {
    title,
    truthLabel: truthLabels[mode],
    body,
    tailNote,
    suggestions,
    actions: {
      primary: { label: "Run again (new seed)", action: "runAgain" },
      secondary,
      utility: [
        { label: "Export stats (CSV)", action: "exportCSV" },
        { label: "Close", action: "close" },
      ],
    },
  };
}
