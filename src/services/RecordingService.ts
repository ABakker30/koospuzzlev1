// Recording Service - WebM video recording from THREE.js canvas
export interface RecordingQuality {
  name: string;
  resolution: { width: number; height: number };
  bitrate: number; // bits per second
  fps: number;
  description: string;
}

export const RECORDING_QUALITIES: Record<string, RecordingQuality> = {
  low: {
    name: 'Low',
    resolution: { width: 1280, height: 720 },
    bitrate: 2_000_000, // 2 Mbps
    fps: 24,
    description: '720p, small file'
  },
  medium: {
    name: 'Medium',
    resolution: { width: 1920, height: 1080 },
    bitrate: 5_000_000, // 5 Mbps
    fps: 30,
    description: '1080p, balanced'
  },
  high: {
    name: 'High',
    resolution: { width: 2560, height: 1440 },
    bitrate: 12_000_000, // 12 Mbps
    fps: 60,
    description: '1440p, large file'
  }
};

export interface RecordingOptions {
  quality: keyof typeof RECORDING_QUALITIES;
  filename?: string;
}

export type RecordingState = 'idle' | 'starting' | 'recording' | 'stopping' | 'processing' | 'error';

export interface RecordingStatus {
  state: RecordingState;
  startTime?: number;
  duration?: number;
  error?: string;
}

export class RecordingService {
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private canvas: HTMLCanvasElement | null = null;
  private stream: MediaStream | null = null;
  private options: RecordingOptions = { quality: 'medium' };
  private status: RecordingStatus = { state: 'idle' };
  private onStatusChange?: (status: RecordingStatus) => void;

  constructor() {
    console.log('🎬 RecordingService: Initialized');
  }

  // Check if recording is supported with cross-browser fallbacks
  static isSupported(): boolean {
    // Basic MediaRecorder support check
    if (!MediaRecorder) {
      return false;
    }

    // Try multiple formats in preference order - MP4 first for Google Photos compatibility
    const preferredTypes = [
      'video/mp4;codecs=h264,aac',  // MP4 - best compatibility with Google Photos
      'video/mp4;codecs=avc1.42E01E,mp4a.40.2', // Alternative MP4 codec specification
      'video/mp4',                  // Let browser choose MP4 codecs
      'video/webm;codecs=vp9,opus', // WebM fallbacks
      'video/webm;codecs=vp8,opus', 
      'video/webm',
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8'
    ];

    let supportedType = null;
    for (const type of preferredTypes) {
      if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(type)) {
        supportedType = type;
        break;
      }
    }

    console.log('🎬 Recording support check:', {
      MediaRecorder: !!MediaRecorder,
      supportedType,
      userAgent: navigator.userAgent,
      allTypes: preferredTypes.map(type => ({
        type,
        supported: MediaRecorder.isTypeSupported ? MediaRecorder.isTypeSupported(type) : false
      }))
    });

    return !!supportedType;
  }

  // Get the best supported MIME type - MP4 first for Google Photos compatibility
  static getBestMimeType(): string {
    const preferredTypes = [
      'video/mp4;codecs=h264,aac',  // MP4 - best compatibility with Google Photos
      'video/mp4;codecs=avc1.42E01E,mp4a.40.2', // Alternative MP4 codec specification
      'video/mp4',                  // Let browser choose MP4 codecs
      'video/webm;codecs=vp9,opus', // WebM fallbacks
      'video/webm;codecs=vp8,opus',
      'video/webm',
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8'
    ];

    for (const type of preferredTypes) {
      if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(type)) {
        console.log('🎬 Selected MIME type:', type);
        return type;
      }
    }

    console.log('🎬 Fallback to default: video/mp4');
    return 'video/mp4'; // Fallback to MP4 for better compatibility
  }

  // Set status change callback
  setStatusCallback(callback: (status: RecordingStatus) => void): void {
    this.onStatusChange = callback;
  }

  // Update status and notify
  private updateStatus(newStatus: Partial<RecordingStatus>): void {
    this.status = { ...this.status, ...newStatus };
    console.log('🎬 RecordingService: Status update:', this.status);
    if (this.onStatusChange) {
      this.onStatusChange(this.status);
    }
  }

  // Initialize recording with canvas
  async initialize(canvas: HTMLCanvasElement, options: RecordingOptions): Promise<void> {
    if (!RecordingService.isSupported()) {
      throw new Error('Recording not supported in this browser. Try Chrome or Firefox.');
    }

    this.canvas = canvas;
    this.options = options;
    this.recordedChunks = [];

    console.log('🎬 RecordingService: Initialized with canvas', {
      canvasSize: { width: canvas.width, height: canvas.height },
      quality: options.quality
    });
  }

  // Start recording
  async startRecording(): Promise<void> {
    if (!this.canvas) {
      throw new Error('Canvas not initialized');
    }

    if (this.status.state !== 'idle') {
      throw new Error(`Cannot start recording from state: ${this.status.state}`);
    }

    try {
      this.updateStatus({ state: 'starting' });

      const quality = RECORDING_QUALITIES[this.options.quality];
      
      // Get canvas stream at desired FPS
      this.stream = this.canvas.captureStream(quality.fps);
      
      // Use the best available MIME type (cross-browser pattern)
      const mimeType = RecordingService.getBestMimeType();

      // Try to create MediaRecorder with fallbacks
      try {
        this.mediaRecorder = new MediaRecorder(this.stream, {
          mimeType,
          videoBitsPerSecond: quality.bitrate
        });
        console.log('🎬 MediaRecorder created with:', { mimeType, bitrate: quality.bitrate });
      } catch (error) {
        console.log('🎬 Failed with specific MIME type, trying without options:', error);
        try {
          // Fallback: try with just mimeType
          this.mediaRecorder = new MediaRecorder(this.stream, { mimeType });
          console.log('🎬 MediaRecorder created with MIME type only:', mimeType);
        } catch (error2) {
          console.log('🎬 Failed with MIME type, trying with no options:', error2);
          // Final fallback: let browser choose everything
          this.mediaRecorder = new MediaRecorder(this.stream);
          console.log('🎬 MediaRecorder created with browser defaults');
        }
      }

      // Set up event handlers
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          this.recordedChunks.push(event.data);
        }
      };

      this.mediaRecorder.onstart = () => {
        console.log('🎬 RecordingService: Recording started');
        this.updateStatus({ 
          state: 'recording', 
          startTime: performance.now() / 1000 
        });
      };

      this.mediaRecorder.onstop = () => {
        console.log('🎬 RecordingService: Recording stopped');
        this.updateStatus({ state: 'processing' });
        this.processRecording();
      };

      this.mediaRecorder.onerror = (event) => {
        console.error('🎬 RecordingService: Recording error:', event);
        this.updateStatus({ 
          state: 'error', 
          error: 'Recording failed. Please try again.' 
        });
      };

      // Start recording
      console.log('🎬 Starting MediaRecorder...');
      this.mediaRecorder.start(100); // Collect data every 100ms
      console.log('🎬 MediaRecorder.start() called successfully');

    } catch (error) {
      console.error('🎬 RecordingService: Failed to start recording:', error);
      console.error('🎬 Error details:', {
        name: error instanceof Error ? error.name : 'Unknown',
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : 'No stack trace'
      });
      this.updateStatus({ 
        state: 'error', 
        error: error instanceof Error ? error.message : 'Failed to start recording' 
      });
      throw error;
    }
  }

  // Stop recording
  async stopRecording(): Promise<void> {
    if (!this.mediaRecorder || this.status.state !== 'recording') {
      throw new Error('No active recording to stop');
    }

    console.log('🎬 RecordingService: Stopping recording...');
    this.updateStatus({ state: 'stopping' });
    
    this.mediaRecorder.stop();
    
    // Stop all tracks in the stream
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
    }
  }

  // Process recorded data and trigger download
  private processRecording(): void {
    if (this.recordedChunks.length === 0) {
      this.updateStatus({ 
        state: 'error', 
        error: 'No recording data available' 
      });
      return;
    }

    try {
      // Get MIME type from MediaRecorder
      const mimeType = this.mediaRecorder?.mimeType || 'video/mp4';
      
      // Create blob from recorded chunks with correct MIME type
      const blob = new Blob(this.recordedChunks, { type: mimeType });
      const url = URL.createObjectURL(blob);
      
      // Generate filename with correct extension based on MIME type
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const extension = mimeType.includes('mp4') ? 'mp4' : 'webm';
      const filename = this.options.filename || `turntable_animation_${timestamp}.${extension}`;
      
      // Trigger download
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      // Clean up
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      
      console.log('🎬 RecordingService: Recording saved:', {
        filename,
        size: `${(blob.size / 1024 / 1024).toFixed(1)} MB`,
        chunks: this.recordedChunks.length
      });

      this.updateStatus({ state: 'idle' });
      this.cleanup();

    } catch (error) {
      console.error('🎬 RecordingService: Failed to process recording:', error);
      this.updateStatus({ 
        state: 'error', 
        error: 'Failed to save recording' 
      });
    }
  }

  // Get current status
  getStatus(): RecordingStatus {
    return { ...this.status };
  }

  // Calculate estimated file size
  getEstimatedFileSize(durationSeconds: number): string {
    const quality = RECORDING_QUALITIES[this.options.quality];
    const estimatedBytes = (quality.bitrate * durationSeconds) / 8;
    const estimatedMB = estimatedBytes / 1024 / 1024;
    return `~${estimatedMB.toFixed(1)} MB`;
  }

  // Cleanup resources
  private cleanup(): void {
    this.recordedChunks = [];
    this.mediaRecorder = null;
    this.stream = null;
  }

  // Dispose service
  dispose(): void {
    if (this.status.state === 'recording') {
      this.stopRecording().catch(console.error);
    }
    this.cleanup();
    this.updateStatus({ state: 'idle' });
    console.log('🎬 RecordingService: Disposed');
  }
}
