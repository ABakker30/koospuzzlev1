// src/utils/anonSession.ts
// Task 4: Generate & persist anonymous session ID

const ANON_SESSION_KEY = 'solve.anonSessionId';

/**
 * Get or create a stable anonymous session ID.
 * Used for telemetry without PII.
 */
export function getAnonSessionId(): string {
  try {
    // Check if we already have one
    const existing = localStorage.getItem(ANON_SESSION_KEY);
    if (existing && existing.length >= 20) {
      return existing;
    }

    // Generate new UUID
    const newId = crypto.randomUUID();
    localStorage.setItem(ANON_SESSION_KEY, newId);
    console.log('🔑 Generated new anonymous session ID:', newId);
    return newId;
  } catch (error) {
    console.error('Failed to get/create anonymous session ID:', error);
    // Fallback: generate without persisting
    return crypto.randomUUID();
  }
}

/**
 * Clear the anonymous session ID (e.g., for testing or user request).
 */
export function clearAnonSessionId(): void {
  try {
    localStorage.removeItem(ANON_SESSION_KEY);
    console.log('🔑 Cleared anonymous session ID');
  } catch (error) {
    console.error('Failed to clear anonymous session ID:', error);
  }
}
