import type { CaptureOptions } from './types';
import { runFixedSteps, calculateFrameCount, calculateDeltaTime } from './clock';

/**
 * Capture service for recording special effects
 * Supports realtime recording via MediaRecorder and offline rendering (stub for v1)
 */

export class CaptureService {
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];

  /**
   * Record canvas in real-time using MediaRecorder
   * @param canvas Canvas element to record
   * @param opts Capture options
   * @returns Promise that resolves to recorded video blob
   */
  async recordRealtime(canvas: HTMLCanvasElement, opts: CaptureOptions): Promise<Blob> {
    if (!canvas) {
      throw new Error('Canvas element is required for recording');
    }

    // Validate browser support
    if (!canvas.captureStream) {
      throw new Error('Canvas.captureStream() not supported in this browser');
    }

    if (!window.MediaRecorder) {
      throw new Error('MediaRecorder not supported in this browser');
    }

    console.log('🎥 Starting realtime recording:', opts);

    // Create media stream from canvas
    const stream = canvas.captureStream(opts.fps);
    
    // Determine codec and MIME type
    const mimeType = this.getSupportedMimeType(opts.codec);
    console.log('🎥 Using MIME type:', mimeType);

    // Create MediaRecorder
    this.mediaRecorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: this.getVideoBitrate(opts.quality, opts.width, opts.height)
    });

    // Reset recorded chunks
    this.recordedChunks = [];

    // Set up event handlers
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder) {
        reject(new Error('MediaRecorder not initialized'));
        return;
      }

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          this.recordedChunks.push(event.data);
        }
      };

      this.mediaRecorder.onstop = () => {
        console.log('🎥 Recording stopped, creating blob');
        const blob = new Blob(this.recordedChunks, { type: mimeType });
        console.log(`🎥 Recording complete: ${(blob.size / 1024 / 1024).toFixed(2)}MB`);
        resolve(blob);
      };

      this.mediaRecorder.onerror = (event) => {
        console.error('🎥 MediaRecorder error:', event);
        reject(new Error('Recording failed'));
      };

      // Start recording
      this.mediaRecorder.start(100); // Collect data every 100ms
      console.log('🎥 MediaRecorder started');

      // Auto-stop after duration if specified
      if (opts.durationSec) {
        setTimeout(() => {
          this.stopRecording();
        }, opts.durationSec * 1000);
      }
    });
  }

  /**
   * Stop current recording
   */
  stopRecording(): void {
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      console.log('🎥 Stopping recording...');
      this.mediaRecorder.stop();
    }
  }

  /**
   * Record offline with fixed timesteps (stub for v1)
   * @param renderer Three.js renderer
   * @param scene Three.js scene
   * @param camera Three.js camera
   * @param effect Effect instance to animate
   * @param opts Capture options
   */
  async recordOffline(
    renderer: any,
    scene: any,
    camera: any,
    effect: any,
    opts: CaptureOptions
  ): Promise<Blob> {
    // Check for WebCodecs support (future implementation)
    if (!('VideoEncoder' in window)) {
      throw new Error('Offline recording requires WebCodecs API (not yet supported in this browser)');
    }

    // For v1, we explicitly defer this feature
    throw new Error('Offline recording not implemented in v1 - use realtime recording instead');

    // Future implementation would use:
    // 1. runFixedSteps() for deterministic timing
    // 2. renderer.render() for each frame
    // 3. canvas.toBlob() or WebCodecs for encoding
    // 4. Combine frames into video file
  }

  /**
   * Generate filename with timestamp
   */
  generateFilename(effectName: string, opts: CaptureOptions): string {
    const timestamp = new Date().toISOString()
      .replace(/[:.]/g, '')
      .replace('T', '_')
      .substring(0, 15); // YYYYMMDD_HHMMSS

    const resolution = `${opts.width}x${opts.height}`;
    const extension = this.getFileExtension(opts.codec);
    
    return `studio_${effectName.toLowerCase()}_${timestamp}_${resolution}${opts.fps}.${extension}`;
  }

  /**
   * Generate sidecar JSON filename
   */
  generateSidecarFilename(effectName: string): string {
    const timestamp = new Date().toISOString()
      .replace(/[:.]/g, '')
      .replace('T', '_')
      .substring(0, 15);

    return `studio_${effectName.toLowerCase()}_${timestamp}.json`;
  }

  /**
   * Download blob as file
   */
  downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    console.log(`📥 Downloaded: ${filename} (${(blob.size / 1024 / 1024).toFixed(2)}MB)`);
  }

  /**
   * Get supported MIME type for recording
   */
  private getSupportedMimeType(preferredCodec?: string): string {
    const candidates = [
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
      'video/mp4'
    ];

    // If specific codec requested, try it first
    if (preferredCodec) {
      const specific = `video/webm;codecs=${preferredCodec}`;
      if (MediaRecorder.isTypeSupported(specific)) {
        return specific;
      }
    }

    // Fall back to first supported type
    for (const mimeType of candidates) {
      if (MediaRecorder.isTypeSupported(mimeType)) {
        return mimeType;
      }
    }

    throw new Error('No supported video MIME types found');
  }

  /**
   * Calculate video bitrate based on quality and resolution
   */
  private getVideoBitrate(quality: string = 'medium', width: number, height: number): number {
    const pixels = width * height;
    const baseRate = pixels / 1000; // Base rate per 1000 pixels

    switch (quality) {
      case 'low': return baseRate * 1000; // 1 bit per pixel
      case 'medium': return baseRate * 2000; // 2 bits per pixel
      case 'high': return baseRate * 4000; // 4 bits per pixel
      case 'max': return baseRate * 8000; // 8 bits per pixel
      default: return baseRate * 2000;
    }
  }

  /**
   * Get file extension based on codec
   */
  private getFileExtension(codec?: string): string {
    if (codec?.includes('mp4')) return 'mp4';
    return 'webm'; // Default to WebM
  }
}

// Singleton instance
export const captureService = new CaptureService();
