import type { PublicationProbe } from "./koosPublicationsProbes.v1";
import { KOOS_PUBLICATIONS_PROBES_V1 } from "./koosPublicationsProbes.v1";
import {
  addProbeItem,
  buildMessagesPreview,
  createProbeRun,
  saveProbeRun,
  type ProbeRun,
} from "./probeRecorder";
import { aiClient } from "../../services/aiClient";
import { getPublicationsContextForAI } from "../knowledge/koosVerhoeff.publications.v1";
import { getStoryContextCondensed } from "../StoryContext";

function utc() {
  return new Date().toISOString();
}

/**
 * Detect if probe query should trigger publications context
 */
function shouldLoadPublications(userMessage: string): boolean {
  const lowerMessage = userMessage.toLowerCase();

  // Direct publication mentions
  const publicationTriggers = [
    'chaos en de computer',
    'chaos and the computer',
    'recreatieve informatica',
    'recreational informatics',
    'boekenweek',
  ];

  if (publicationTriggers.some(title => lowerMessage.includes(title))) {
    return true;
  }

  // Koos's writings/philosophy
  const koosWritingTriggers = [
    /koos.*writ/i,
    /koos.*wrote/i,
    /koos.*publish/i,
    /koos.*book/i,
    /koos.*lecture/i,
    /koos.*philosoph/i,
    /koos.*argument/i,
    /koos.*art/i,
    /koos.*influence/i,
  ];

  if (koosWritingTriggers.some(pattern => pattern.test(userMessage))) {
    return true;
  }

  // Specific concepts from publications
  const conceptTriggers = [
    'anti-information',
    'anti information',
    'lattice structures',
    'lattice',
  ];

  if (conceptTriggers.some(concept => lowerMessage.includes(concept))) {
    if (lowerMessage.includes('koos') || lowerMessage.includes('verhoeff')) {
      return true;
    }
  }

  return false;
}

/**
 * Run all Koos Publications probes using the real AI pipeline.
 * Tests conditional loading of publications knowledge.
 */
export async function runPublicationsProbes(
  app_version?: string,
  onProgress?: (i: number, total: number) => void
): Promise<ProbeRun> {
  const run: ProbeRun = createProbeRun(app_version, "publications");

  for (let i = 0; i < KOOS_PUBLICATIONS_PROBES_V1.length; i++) {
    const probe: PublicationProbe = KOOS_PUBLICATIONS_PROBES_V1[i];
    onProgress?.(i + 1, KOOS_PUBLICATIONS_PROBES_V1.length);

    const started = Date.now();
    const started_at_utc = utc();

    // Base system prompt
    let systemPrompt = `
You are the AI assistant inside the Koos Puzzle app.

Style: Friendly, curious, natural. Keep responses conversational and clear.
Answer questions naturally without forcing history or context unless relevant.
    `.trim();

    // Add general story context
    const storyContext = getStoryContextCondensed();
    systemPrompt += `\n\nBackground context (use when relevant, but keep responses natural):\n${storyContext}`;

    // CONDITIONAL: Add publications context ONLY if probe question is about Koos's writings
    const publicationsLoaded = shouldLoadPublications(probe.user);
    if (publicationsLoaded) {
      const publicationsContext = getPublicationsContextForAI();
      systemPrompt += `\n\n---\n\n${publicationsContext}`;
      console.log(`[Probe ${probe.id}] Publications context loaded`);
    } else {
      console.log(`[Probe ${probe.id}] Publications context dormant`);
    }

    const messages = [
      { role: "system" as const, content: systemPrompt },
      { role: "user" as const, content: probe.user },
    ];

    try {
      // Use the REAL AI pipeline (same as normal chat)
      const text = await aiClient.chat(messages, {
        screen: { name: "probe_mode_publications" },
      });

      const finished_at_utc = utc();
      const latency_ms = Date.now() - started;

      addProbeItem(run, {
        probe: {
          id: probe.id,
          lang: probe.lang,
          user: probe.user,
          expectation_tags: probe.expectation_tags,
        },
        started_at_utc,
        finished_at_utc,
        latency_ms,
        request: {
          model: "gpt-4o-mini",
          messages_preview: buildMessagesPreview(messages),
          system_chars: systemPrompt.length,
        },
        response: { text },
      });
    } catch (e: any) {
      const finished_at_utc = utc();
      const latency_ms = Date.now() - started;

      console.log(`[Probe ${probe.id}] ERROR:`, e?.message ?? String(e));
      
      addProbeItem(run, {
        probe: {
          id: probe.id,
          lang: probe.lang,
          user: probe.user,
          expectation_tags: probe.expectation_tags,
        },
        started_at_utc,
        finished_at_utc,
        latency_ms,
        request: {
          messages_preview: buildMessagesPreview(messages),
          system_chars: systemPrompt.length,
        },
        response: { 
          text: "", 
          error: e?.message ?? String(e),
        },
      });
    }
  }

  saveProbeRun(run);
  return run;
}
