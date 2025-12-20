/**
 * Home Thought Service - AI-generated daily inspirational prompts
 * 
 * Purpose:
 * - Generate short, thoughtful invitations to curiosity
 * - Fast, non-blocking, cached per session
 * - Multi-language support
 * - Fallback on failures
 * 
 * Constraints:
 * - text: max 120 characters
 * - seed: max 240 characters
 * - No controversial topics
 * - No emojis or markdown
 */

import { aiClient } from '../services/aiClient';

export type HomeThought = {
  text: string;
  seed: string;
  lang: string;
};

const CACHE_KEY_PREFIX = 'home_thought_v1_';
const MAX_TEXT_LENGTH = 120;
const MAX_SEED_LENGTH = 240;

/**
 * Fallback thoughts for when AI generation fails
 */
const FALLBACK_THOUGHTS: Record<string, HomeThought> = {
  en: {
    text: "Look deeper and patterns appear.",
    seed: "What patterns tend to appear when we look deeper?",
    lang: "en",
  },
  nl: {
    text: "Kijk dieper en patronen verschijnen.",
    seed: "Welke patronen verschijnen wanneer we dieper kijken?",
    lang: "nl",
  },
  fr: {
    text: "Regardez plus profondément et les motifs apparaissent.",
    seed: "Quels motifs apparaissent lorsque nous regardons plus profondément?",
    lang: "fr",
  },
  de: {
    text: "Schaue tiefer und Muster erscheinen.",
    seed: "Welche Muster erscheinen, wenn wir tiefer schauen?",
    lang: "de",
  },
  es: {
    text: "Mira más profundo y aparecen patrones.",
    seed: "¿Qué patrones aparecen cuando miramos más profundamente?",
    lang: "es",
  },
};

/**
 * Get fallback thought for a language
 */
function getFallbackThought(lang: string): HomeThought {
  return FALLBACK_THOUGHTS[lang] || FALLBACK_THOUGHTS.en;
}

/**
 * Validate generated thought structure and content
 */
function validateThought(data: any, lang: string): HomeThought | null {
  try {
    if (!data || typeof data !== 'object') {
      return null;
    }

    const text = String(data.text || '').trim();
    const seed = String(data.seed || '').trim();

    // Length validation
    if (text.length === 0 || text.length > MAX_TEXT_LENGTH) {
      console.warn('Home thought text length invalid:', text.length);
      return null;
    }

    if (seed.length === 0 || seed.length > MAX_SEED_LENGTH) {
      console.warn('Home thought seed length invalid:', seed.length);
      return null;
    }

    // Content validation: no emojis, no markdown
    const emojiRegex = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    if (emojiRegex.test(text) || emojiRegex.test(seed)) {
      console.warn('Home thought contains emojis');
      return null;
    }

    const markdownRegex = /[*_`#\[\]]/;
    if (markdownRegex.test(text) || markdownRegex.test(seed)) {
      console.warn('Home thought contains markdown');
      return null;
    }

    return { text, seed, lang };
  } catch (error) {
    console.error('Home thought validation error:', error);
    return null;
  }
}

/**
 * Get cached thought from session storage
 */
function getCachedThought(lang: string): HomeThought | null {
  try {
    const cached = sessionStorage.getItem(CACHE_KEY_PREFIX + lang);
    if (!cached) return null;

    const thought = JSON.parse(cached);
    return validateThought(thought, lang);
  } catch (error) {
    console.warn('Failed to load cached thought:', error);
    return null;
  }
}

/**
 * Cache thought to session storage
 */
function cacheThought(thought: HomeThought): void {
  try {
    sessionStorage.setItem(CACHE_KEY_PREFIX + thought.lang, JSON.stringify(thought));
  } catch (error) {
    console.warn('Failed to cache thought:', error);
  }
}

/**
 * Generate a new thought using AI
 */
async function generateThoughtFromAI(lang: string): Promise<HomeThought> {
  const languageNames: Record<string, string> = {
    en: 'English',
    nl: 'Dutch',
    fr: 'French',
    de: 'German',
    es: 'Spanish',
    it: 'Italian',
    pt: 'Portuguese',
    ru: 'Russian',
    ja: 'Japanese',
    ko: 'Korean',
    'zh-CN': 'Simplified Chinese',
    'zh-TW': 'Traditional Chinese',
  };

  const languageName = languageNames[lang] || 'English';

  const systemPrompt = `You generate a single short thought to invite curiosity about puzzles, symmetry, perspective, play, learning, or wonder.

STRICT REQUIREMENTS:
- Return ONLY valid JSON: {"text": "...", "seed": "..."}
- text: max 120 characters (inspirational statement)
- seed: max 240 characters (question to explore the thought)
- Language: ${languageName}
- NO emojis
- NO markdown
- NO quotes about politics, religion, medical advice, or controversial topics
- Keep it philosophical, playful, and inviting

Example output:
{"text": "Play is not the opposite of learning. It is the engine of it.", "seed": "Why is play such a powerful way to learn?"}`;

  const userPrompt = `Generate one thought about: symmetry, perspective, patterns, play as learning, discovery, or wonder. Make it thought-provoking but gentle. Output JSON only.`;

  try {
    const response = await aiClient.chat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      {
        screen: { name: 'home_thought_generator' },
      }
    );

    // Parse JSON response
    const parsed = JSON.parse(response);
    const validated = validateThought(parsed, lang);

    if (!validated) {
      console.warn('AI generated invalid thought, using fallback');
      return getFallbackThought(lang);
    }

    return validated;
  } catch (error) {
    console.error('Failed to generate home thought:', error);
    return getFallbackThought(lang);
  }
}

/**
 * Get home thought - cached or newly generated
 * 
 * @param lang Language code (en, nl, fr, etc.)
 * @returns HomeThought (never null - falls back on errors)
 */
export async function getHomeThought(lang: string = 'en'): Promise<HomeThought> {
  // Check cache first
  const cached = getCachedThought(lang);
  if (cached) {
    return cached;
  }

  // Generate new thought
  const thought = await generateThoughtFromAI(lang);
  
  // Cache for session
  cacheThought(thought);
  
  return thought;
}

/**
 * Clear cached thoughts (useful for testing)
 */
export function clearHomeThoughtCache(): void {
  try {
    Object.keys(sessionStorage).forEach(key => {
      if (key.startsWith(CACHE_KEY_PREFIX)) {
        sessionStorage.removeItem(key);
      }
    });
  } catch (error) {
    console.warn('Failed to clear thought cache:', error);
  }
}
