// Audio utility for sound effects

// Pre-load audio elements for instant playback
const audioCache = new Map<string, HTMLAudioElement>();

/**
 * Play a sound effect
 * @param soundName - Name of the sound file (without extension) in /data/Audio/
 * @param volume - Volume level (0.0 to 1.0), default 0.5
 */
export function playSound(soundName: string, volume: number = 0.5): void {
  try {
    const path = `/data/Audio/${soundName}.mp3`;
    
    // Reuse cached audio or create new
    let audio = audioCache.get(path);
    
    if (!audio) {
      audio = new Audio(path);
      audioCache.set(path, audio);
    }
    
    // Clone for overlapping sounds
    const clone = audio.cloneNode() as HTMLAudioElement;
    clone.volume = Math.max(0, Math.min(1, volume));
    clone.play().catch(err => {
      // Ignore autoplay restrictions - sound will play after user interaction
      console.debug('Audio play blocked:', err.message);
    });
  } catch (err) {
    console.debug('Failed to play sound:', err);
  }
}

/**
 * Pre-load a sound for faster first playback
 */
export function preloadSound(soundName: string): void {
  const path = `/data/Audio/${soundName}.mp3`;
  if (!audioCache.has(path)) {
    const audio = new Audio(path);
    audio.preload = 'auto';
    audioCache.set(path, audio);
  }
}

/**
 * Play a sound effect with specific extension
 */
export function playSoundWithExt(soundName: string, ext: string, volume: number = 0.5): void {
  try {
    const path = `/data/Audio/${soundName}.${ext}`;
    
    let audio = audioCache.get(path);
    
    if (!audio) {
      audio = new Audio(path);
      audioCache.set(path, audio);
    }
    
    const clone = audio.cloneNode() as HTMLAudioElement;
    clone.volume = Math.max(0, Math.min(1, volume));
    clone.play().catch(err => {
      console.debug('Audio play blocked:', err.message);
    });
  } catch (err) {
    console.debug('Failed to play sound:', err);
  }
}

// Sound effect shortcuts
export const sounds = {
  pop: () => playSound('Pop', 0.4),
  draw: () => playSoundWithExt('draw', 'wav', 0.3),
  failed: () => playSoundWithExt('Failed', 'wav', 0.4),
};
