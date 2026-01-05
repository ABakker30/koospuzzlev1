/**
 * Share URL utilities for generating rich link preview URLs
 * 
 * When sharing content, we use a Supabase Edge Function that returns
 * HTML with Open Graph meta tags. This allows WhatsApp, iMessage, Slack,
 * etc. to show rich previews with images and descriptions.
 */

// Supabase project URL - should match your .env configuration
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://cpblvcajrvlqatniceap.supabase.co';

/**
 * Content types that can be shared with rich previews
 */
export type ShareableType = 'puzzle' | 'solution' | 'movie';

/**
 * Generate a share URL that will show rich link previews on social platforms
 * 
 * @param type - The type of content being shared
 * @param id - The unique identifier of the content
 * @returns URL string that can be shared
 * 
 * @example
 * ```ts
 * const url = getShareUrl('puzzle', 'abc123');
 * // Returns: https://xxx.supabase.co/functions/v1/share-preview?type=puzzle&id=abc123
 * ```
 */
export function getShareUrl(type: ShareableType, id: string): string {
  const params = new URLSearchParams({
    type,
    id
  });
  
  return `${SUPABASE_URL}/functions/v1/share-preview?${params.toString()}`;
}

/**
 * Generate share data for the Web Share API
 * 
 * @param type - The type of content being shared
 * @param id - The unique identifier
 * @param title - Display title for the content
 * @param text - Optional description text
 */
export function getShareData(
  type: ShareableType,
  id: string,
  title: string,
  text?: string
): ShareData {
  return {
    title,
    text: text || `Check out this ${type}: ${title}`,
    url: getShareUrl(type, id)
  };
}

/**
 * Share content using the Web Share API with fallback to clipboard
 * 
 * @param type - The type of content being shared
 * @param id - The unique identifier
 * @param title - Display title for the content
 * @param text - Optional description text
 * @returns Promise that resolves to 'shared' | 'copied' | 'cancelled'
 */
export async function shareContent(
  type: ShareableType,
  id: string,
  title: string,
  text?: string
): Promise<'shared' | 'copied' | 'cancelled'> {
  const shareUrl = getShareUrl(type, id);
  
  // Try Web Share API first (works on mobile and modern browsers)
  if (navigator.share) {
    try {
      await navigator.share({
        title,
        text: text || `Check out this ${type}: ${title}`,
        url: shareUrl
      });
      return 'shared';
    } catch (err) {
      // User cancelled the share dialog
      if ((err as Error).name === 'AbortError') {
        return 'cancelled';
      }
      // Fall through to clipboard fallback
    }
  }
  
  // Fallback: Copy to clipboard
  try {
    await navigator.clipboard.writeText(shareUrl);
    return 'copied';
  } catch (err) {
    console.error('Failed to copy to clipboard:', err);
    return 'cancelled';
  }
}
