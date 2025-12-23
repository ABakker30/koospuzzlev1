/**
 * Captures a thumbnail from a Three.js canvas element
 * @param canvas - The HTMLCanvasElement from renderer.domElement
 * @param maxW - Maximum width for the thumbnail (default 1024)
 * @returns PNG data URL string
 */
export function captureCanvasThumbnail(
  canvas: HTMLCanvasElement,
  maxW: number = 1024
): string {
  try {
    const originalWidth = canvas.width;
    const originalHeight = canvas.height;

    // If already smaller than maxW, just export directly
    if (originalWidth <= maxW) {
      return canvas.toDataURL('image/png');
    }

    // Scale down to maxW while preserving aspect ratio
    const scale = maxW / originalWidth;
    const scaledWidth = maxW;
    const scaledHeight = Math.round(originalHeight * scale);

    // Create offscreen canvas for scaling
    const offscreenCanvas = document.createElement('canvas');
    offscreenCanvas.width = scaledWidth;
    offscreenCanvas.height = scaledHeight;

    const ctx = offscreenCanvas.getContext('2d');
    if (!ctx) {
      console.warn('Failed to get 2D context for thumbnail scaling');
      return canvas.toDataURL('image/png');
    }

    // Draw scaled image
    ctx.drawImage(canvas, 0, 0, scaledWidth, scaledHeight);

    // Export as PNG data URL
    return offscreenCanvas.toDataURL('image/png');
  } catch (error) {
    console.error('Error capturing canvas thumbnail:', error);
    // Fallback to direct export
    return canvas.toDataURL('image/png');
  }
}
