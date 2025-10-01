// Turn Table Effect - lifecycle implementation (no motion yet)
import { TurnTableConfig, DEFAULT_CONFIG, validateConfig } from './presets';
import { TurnTableState, canPlay, canPause, canResume, canStop, canTick, isDisposed } from './state';
import { Effect } from './types';

export class TurnTableEffect implements Effect {
  private state: TurnTableState = TurnTableState.IDLE;
  private config: TurnTableConfig = { ...DEFAULT_CONFIG };
  private context: any = null; // EffectContext - will be properly typed later
  
  // Cached context references (validated in init)
  private scene: any = null;
  private spheresGroup: any = null;
  private camera: any = null;
  private controls: any = null;
  private renderer: any = null;
  private centroidWorld: any = null;

  constructor() {
    this.log('action=construct', 'state=idle');
  }

  // Initialize with effect context
  init(ctx: any): void {
    if (isDisposed(this.state)) {
      this.log('action=init', 'state=disposed', 'note=effect is disposed, ignoring init');
      return;
    }

    this.log('action=init', `state=${this.state}`);

    // Validate required context properties
    if (!ctx) {
      throw new Error('TurnTableEffect: EffectContext is required');
    }

    const required = ['scene', 'spheresGroup', 'camera', 'controls', 'renderer', 'centroidWorld'];
    for (const prop of required) {
      if (!ctx[prop]) {
        throw new Error(`TurnTableEffect: Missing required context property: ${prop}`);
      }
    }

    // Cache context references (no mutations)
    this.context = ctx;
    this.scene = ctx.scene;
    this.spheresGroup = ctx.spheresGroup;
    this.camera = ctx.camera;
    this.controls = ctx.controls;
    this.renderer = ctx.renderer;
    this.centroidWorld = ctx.centroidWorld;

    this.log('action=init', 'state=idle', 'note=context cached successfully');
  }

  // Set configuration with validation
  setConfig(cfg: object): void {
    if (isDisposed(this.state)) {
      this.log('action=set-config', 'state=disposed', 'note=effect is disposed, ignoring setConfig');
      return;
    }

    this.log('action=set-config', `state=${this.state}`, `config=${JSON.stringify(cfg)}`);

    // Validate configuration
    const validation = validateConfig(cfg as Partial<TurnTableConfig>);
    if (!validation.isValid) {
      const errorMsg = `Invalid configuration: ${Object.entries(validation.errors).map(([k, v]) => `${k}: ${v}`).join(', ')}`;
      this.log('action=set-config', `state=${this.state}`, `note=validation failed: ${errorMsg}`);
      throw new Error(`TurnTableEffect: ${errorMsg}`);
    }

    // Deep copy to prevent external mutations
    this.config = JSON.parse(JSON.stringify(cfg));
    this.log('action=set-config', `state=${this.state}`, 'note=config updated successfully');
  }

  // Get configuration (deep copy)
  getConfig(): object {
    if (isDisposed(this.state)) {
      this.log('action=get-config', 'state=disposed', 'note=effect is disposed, returning default config');
      return { ...DEFAULT_CONFIG };
    }

    this.log('action=get-config', `state=${this.state}`);
    
    // Return deep copy to prevent external mutations
    return JSON.parse(JSON.stringify(this.config));
  }

  // Start playback
  play(): void {
    if (isDisposed(this.state)) {
      this.log('action=play', 'state=disposed', 'note=effect is disposed, ignoring play');
      return;
    }

    if (!canPlay(this.state)) {
      this.log('action=play', `state=${this.state}`, 'note=cannot play from current state');
      return;
    }

    const previousState = this.state;
    this.state = TurnTableState.PLAYING;
    this.log('action=play', `state=${this.state}`, `note=transitioned from ${previousState}`);

    // No scene mutations yet - motion will be added in later PR
  }

  // Pause playback
  pause(): void {
    if (isDisposed(this.state)) {
      this.log('action=pause', 'state=disposed', 'note=effect is disposed, ignoring pause');
      return;
    }

    if (!canPause(this.state)) {
      this.log('action=pause', `state=${this.state}`, 'note=cannot pause from current state');
      return;
    }

    const previousState = this.state;
    this.state = TurnTableState.PAUSED;
    this.log('action=pause', `state=${this.state}`, `note=transitioned from ${previousState}`);

    // No scene mutations yet - motion will be added in later PR
  }

  // Resume playback
  resume(): void {
    if (isDisposed(this.state)) {
      this.log('action=resume', 'state=disposed', 'note=effect is disposed, ignoring resume');
      return;
    }

    if (!canResume(this.state)) {
      this.log('action=resume', `state=${this.state}`, 'note=cannot resume from current state');
      return;
    }

    const previousState = this.state;
    this.state = TurnTableState.PLAYING;
    this.log('action=resume', `state=${this.state}`, `note=transitioned from ${previousState}`);

    // No scene mutations yet - motion will be added in later PR
  }

  // Stop playback
  stop(): void {
    if (isDisposed(this.state)) {
      this.log('action=stop', 'state=disposed', 'note=effect is disposed, ignoring stop');
      return;
    }

    if (!canStop(this.state)) {
      this.log('action=stop', `state=${this.state}`, 'note=cannot stop from current state');
      return;
    }

    const previousState = this.state;
    this.state = TurnTableState.STOPPED;
    this.log('action=stop', `state=${this.state}`, `note=transitioned from ${previousState}`);

    // Finalization policy will be applied in Motion PR
    // For now, just log the intended policy
    this.log('action=stop', `state=${this.state}`, `note=finalization policy: ${this.config.finalize}`);
  }

  // Animation tick (no-op for now)
  tick(time: number): void {
    if (isDisposed(this.state)) {
      return; // Silent return for disposed state
    }

    if (!canTick(this.state)) {
      return; // Silent return for non-playing states
    }

    // Debug logging only (to avoid noise)
    // Only log occasionally to avoid spam
    if (Math.floor(time * 10) % 30 === 0) { // Every ~3 seconds at 10fps
      this.log('action=tick', `state=${this.state}`, `time=${time.toFixed(3)}`);
    }

    // Motion implementation will be added in later PR
  }

  // Clean up and dispose
  dispose(): void {
    if (isDisposed(this.state)) {
      this.log('action=dispose', 'state=disposed', 'note=already disposed, ignoring');
      return;
    }

    const previousState = this.state;
    this.state = TurnTableState.DISPOSED;
    
    // Clear all references
    this.context = null;
    this.scene = null;
    this.spheresGroup = null;
    this.camera = null;
    this.controls = null;
    this.renderer = null;
    this.centroidWorld = null;

    this.log('action=dispose', `state=${this.state}`, `note=transitioned from ${previousState}, references cleared`);

    // No timers or listeners to clean up yet - will be added in Motion PR
  }

  // Structured logging helper
  private log(action: string, state?: string, note?: string): void {
    const parts = [`effect=turntable`, action];
    if (state) parts.push(state);
    if (note) parts.push(note);
    
    console.log(parts.join(' '));
  }
}
