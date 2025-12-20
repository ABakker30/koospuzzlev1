import type { Probe } from "./koosStoryProbes.v1";
import { KOOS_PROBES_V1 } from "./koosStoryProbes.v1";
import {
  addProbeItem,
  buildMessagesPreview,
  createProbeRun,
  saveProbeRun,
  type ProbeRun,
} from "./probeRecorder";
import { aiClient } from "../../services/aiClient";
import { getStoryContextCondensed } from "../StoryContext";

function utc() {
  return new Date().toISOString();
}

/**
 * Run all Koos Story probes using the real AI pipeline.
 * This ensures probes test the same stack as normal chat.
 */
export async function runKoosProbes(
  app_version?: string,
  onProgress?: (i: number, total: number) => void
): Promise<ProbeRun> {
  const run: ProbeRun = createProbeRun(app_version);

  for (let i = 0; i < KOOS_PROBES_V1.length; i++) {
    const probe: Probe = KOOS_PROBES_V1[i];
    onProgress?.(i + 1, KOOS_PROBES_V1.length);

    const started = Date.now();
    const started_at_utc = utc();

    // Build system message with story context (same as normal chat)
    const storyContext = getStoryContextCondensed();
    const systemPrompt = `
You are the AI assistant inside the Koos Puzzle app.

Style: Friendly, curious, natural. Keep responses conversational and clear.
Answer questions naturally without forcing history or context unless relevant.

Background context (use when relevant, but keep responses natural):
${storyContext}
    `.trim();

    const messages = [
      { role: "system" as const, content: systemPrompt },
      { role: "user" as const, content: probe.user },
    ];

    try {
      // Use the REAL AI pipeline (same as normal chat)
      const text = await aiClient.chat(messages, {
        screen: { name: "probe_mode" },
      });

      const finished_at_utc = utc();
      const latency_ms = Date.now() - started;

      addProbeItem(run, {
        probe,
        started_at_utc,
        finished_at_utc,
        latency_ms,
        request: {
          model: "gpt-4o-mini", // aiClient uses this via edge function
          messages_preview: buildMessagesPreview(messages),
          system_chars: systemPrompt.length,
        },
        response: { text },
      });
    } catch (e: any) {
      const finished_at_utc = utc();
      const latency_ms = Date.now() - started;

      addProbeItem(run, {
        probe,
        started_at_utc,
        finished_at_utc,
        latency_ms,
        request: {
          messages_preview: buildMessagesPreview(messages),
          system_chars: systemPrompt.length,
        },
        response: { text: "", error: e?.message ?? String(e) },
      });
    }
  }

  saveProbeRun(run);
  return run;
}
