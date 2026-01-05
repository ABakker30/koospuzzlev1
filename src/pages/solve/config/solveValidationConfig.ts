/**
 * Configuration for solve validation in VS mode.
 */

/**
 * Maximum time (in milliseconds) to wait for DLX solvability check.
 * If exceeded, the result is 'unknown' and the move is accepted with points.
 * 
 * Tuning guide:
 * - Lower values = faster gameplay, more 'unknown' results early game
 * - Higher values = more accurate validation, potential blocking early game
 * - 5000ms is a reasonable starting point
 */
export const DLX_SOLVABILITY_TIMEOUT_MS = 5000;
