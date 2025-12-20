/**
 * Daily Prompts - Rotating inspirational thoughts and questions
 * 
 * Purpose:
 * - Gentle intellectual invitations on the homepage
 * - Encourages curiosity without being pushy
 * - Leads naturally into AI chat conversations
 * 
 * Rotation:
 * - Deterministic, date-based (no backend needed)
 * - Changes daily at midnight UTC
 */

export type DailyPrompt = {
  id: string;
  kind: "quote" | "subject";
  title?: string;
  text: string;
  chat_seed: string;
};

export const DAILY_PROMPTS: DailyPrompt[] = [
  {
    id: "symmetry-01",
    kind: "quote",
    text: "Look deeper and patterns appear.",
    chat_seed: "Why does symmetry feel so fundamental to how we see beauty?",
  },
  {
    id: "perspective-01",
    kind: "subject",
    title: "Perspective",
    text: "The same structure can look completely different from another angle.",
    chat_seed: "Can you explain why perspective changes meaning in puzzles and in life?",
  },
  {
    id: "play-01",
    kind: "quote",
    text: "Play is not the opposite of learning. It is the engine of it.",
    chat_seed: "Why is play such a powerful way to learn?",
  },
  {
    id: "lattices-01",
    kind: "subject",
    title: "Structure",
    text: "Atoms arrange themselves in lattices. So do ideas.",
    chat_seed: "What's the connection between atomic structures and how we think about puzzles?",
  },
  {
    id: "questions-01",
    kind: "quote",
    text: "Sometimes a good question is worth more than a perfect answer.",
    chat_seed: "Why are questions sometimes more valuable than answers?",
  },
  {
    id: "discovery-01",
    kind: "subject",
    title: "Discovery",
    text: "Discovery beats memorization every time.",
    chat_seed: "How does discovery differ from memorization when it comes to learning?",
  },
  {
    id: "slowdown-01",
    kind: "quote",
    text: "Sit on your hands. Think first. Then move.",
    chat_seed: "What does it mean to slow down and think before acting?",
  },
];

/**
 * Get the daily prompt based on current date
 * Deterministic rotation - same prompt for all users on same day
 */
export function getDailyPrompt(): DailyPrompt {
  if (DAILY_PROMPTS.length === 0) {
    return {
      id: "fallback",
      kind: "quote",
      text: "Every puzzle tells a story.",
      chat_seed: "What story does the Koos Puzzle tell?",
    };
  }

  const dayIndex = Math.floor(Date.now() / (1000 * 60 * 60 * 24));
  return DAILY_PROMPTS[dayIndex % DAILY_PROMPTS.length];
}
