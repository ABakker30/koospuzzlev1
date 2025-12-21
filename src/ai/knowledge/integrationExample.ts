// src/ai/knowledge/integrationExample.ts
//
// Example: How to conditionally load Koos publications knowledge
// in AI chat hooks
//
// DO NOT IMPORT THIS FILE IN PRODUCTION CODE
// This is a reference implementation only

import { getPublicationsContextForAI } from './koosVerhoeff.publications.v1';

// ------------------------------------------------------------
// Step 1: Intent Detection
// ------------------------------------------------------------

/**
 * Detects if user message is asking about Koos's publications
 * 
 * Returns true ONLY for explicit publication queries
 * Returns false for general puzzle/app questions
 */
export function shouldLoadPublicationsContext(userMessage: string): boolean {
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
    /koos.*speech/i,
    /koos.*philosoph/i,
    /koos.*argument/i,
    /koos.*position/i,
    /koos.*view/i,
  ];

  if (koosWritingTriggers.some(pattern => pattern.test(userMessage))) {
    return true;
  }

  // Specific concepts from publications
  const conceptTriggers = [
    'anti-information',
    'anti information',
    'information hunger',
    'chaos theory',
    'fractal',
    'bifurcation',
    'period doubling',
  ];

  // Only trigger on concepts if paired with "koos" or "verhoeff"
  if (conceptTriggers.some(concept => lowerMessage.includes(concept))) {
    if (lowerMessage.includes('koos') || lowerMessage.includes('verhoeff')) {
      return true;
    }
  }

  return false;
}

// ------------------------------------------------------------
// Step 2: Integration in Chat Hook
// ------------------------------------------------------------

/**
 * Example integration pattern for useGameChat or similar
 */
export async function exampleChatIntegration(
  userMessage: string,
  includeStoryContext: boolean
): Promise<string> {
  // Base system prompt
  let systemPrompt = `
You are the AI assistant inside the Koos Puzzle app.
Style: Friendly, curious, natural. Keep responses conversational and clear.
Answer questions naturally without forcing history or context unless relevant.
  `.trim();

  // Add general story context if requested (from StoryContext.ts)
  if (includeStoryContext) {
    // const storyContext = getStoryContextCondensed();
    // systemPrompt += `\n\n${storyContext}`;
  }

  // CONDITIONAL: Add publications context ONLY if user is asking about Koos's writings
  if (shouldLoadPublicationsContext(userMessage)) {
    const publicationsContext = getPublicationsContextForAI();
    systemPrompt += `\n\n---\n\n${publicationsContext}`;
    
    console.log('[AI] Loaded Koos publications knowledge (explicit request detected)');
  } else {
    console.log('[AI] Publications knowledge dormant (not relevant to query)');
  }

  // Continue with chat call...
  // return await aiClient.chat([...], {...});
  
  return systemPrompt; // Example only
}

// ------------------------------------------------------------
// Step 3: Testing the Intent Detection
// ------------------------------------------------------------

/**
 * Test cases for intent detection
 */
export const INTENT_DETECTION_TESTS = [
  // Should trigger (true)
  { message: "What did Koos argue in Chaos en de computer?", expected: true },
  { message: "Tell me about Recreatieve Informatica", expected: true },
  { message: "What is anti-information according to Koos?", expected: true },
  { message: "Did Koos write about chaos theory?", expected: true },
  { message: "What was Koos's philosophy of play?", expected: true },
  
  // Should NOT trigger (false)
  { message: "How do I solve this puzzle?", expected: false },
  { message: "What is the Koos Puzzle?", expected: false },
  { message: "Tell me about the Ball Maze Project", expected: false },
  { message: "How do I rotate pieces?", expected: false },
  { message: "What are fractals?", expected: false }, // No "Koos" mention
  { message: "Who is Koos Verhoeff?", expected: false }, // Bio, not publications
];

/**
 * Run intent detection tests
 */
export function validateIntentDetection(): void {
  console.log('Testing intent detection...\n');
  
  let passed = 0;
  let failed = 0;

  for (const test of INTENT_DETECTION_TESTS) {
    const result = shouldLoadPublicationsContext(test.message);
    const status = result === test.expected ? '✅' : '❌';
    
    if (result === test.expected) {
      passed++;
    } else {
      failed++;
      console.log(`${status} FAILED: "${test.message}"`);
      console.log(`   Expected: ${test.expected}, Got: ${result}\n`);
    }
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
}

// ------------------------------------------------------------
// Step 4: Usage in Actual Chat Hook
// ------------------------------------------------------------

/**
 * Pseudo-code for actual implementation in useGameChat.ts
 */
/*
import { shouldLoadPublicationsContext, getPublicationsContextForAI } from '../../ai/knowledge/koosVerhoeff.publications.v1';

// Inside sendMessage function:
const handleAIResponse = async () => {
  let systemPrompt = buildBaseSystemPrompt();
  
  // Story context (general)
  if (includeStoryContext) {
    systemPrompt += getStoryContextCondensed();
  }
  
  // Publications context (conditional, dormant by default)
  if (shouldLoadPublicationsContext(trimmedMessage)) {
    systemPrompt += '\n\n' + getPublicationsContextForAI();
    
    // Optional: Add explicit reminder
    systemPrompt += '\n\nIMPORTANT: User is asking about Koos Verhoeff\'s publications. Use ONLY documented content from the texts above. Do not invent or extrapolate.';
  }
  
  const reply = await aiClient.chat([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: trimmedMessage }
  ], { screen: { name: 'chat' } });
  
  return reply;
};
*/

// ------------------------------------------------------------
// Step 5: Monitoring and Logging
// ------------------------------------------------------------

/**
 * Log when publications context is loaded (for debugging)
 */
export function logPublicationsContextUsage(
  userMessage: string,
  wasLoaded: boolean
): void {
  if (wasLoaded) {
    console.log('[Publications] Context loaded for:', userMessage.substring(0, 50));
  } else {
    console.log('[Publications] Context dormant (not needed)');
  }
}
