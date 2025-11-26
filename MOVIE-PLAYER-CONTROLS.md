# MoviePlayer Playback Controls

## Features Added

✅ **Play/Pause/Stop Controls** - Exposed via ref  
✅ **Auto-play** - Starts automatically when ready  
✅ **Loop Mode** - Restarts when complete  
✅ **State Callbacks** - Notifies parent of play state changes  
✅ **Movie Settings** - Uses studio_settings from movie record  

---

## API Reference

### Props

```typescript
interface MoviePlayerProps {
  movie: MovieRecord;              // Movie data from database
  autoPlay?: boolean;              // Auto-start (default: false)
  loop?: boolean;                  // Loop when complete (default: false)
  headless?: boolean;              // Hide UI overlay (default: true)
  onComplete?: () => void;         // Called when effect ends (if not looping)
  onError?: (error: string) => void;  // Called on error
  onPlayStateChange?: (isPlaying: boolean) => void;  // Called when play state changes
}
```

### Ref API

```typescript
interface MoviePlayerRef {
  play: () => void;      // Start/resume playback
  pause: () => void;     // Pause playback
  stop: () => void;      // Stop and reset
  isPlaying: boolean;    // Current playback state
}
```

---

## Usage Examples

### Example 1: HomePage (Auto-play + Loop)

```tsx
import { MoviePlayer } from '../../components/movie/MoviePlayer';

const HomePage = () => {
  const [featuredMovie, setFeaturedMovie] = useState(null);

  return (
    <div style={{ width: '900px', aspectRatio: '16/9' }}>
      <MoviePlayer 
        movie={featuredMovie}
        autoPlay={true}
        loop={true}
        headless={true}
      />
    </div>
  );
};
```

**Result:** Movie plays automatically and loops forever. No controls needed.

---

### Example 2: With Playback Controls

```tsx
import { MoviePlayer, MoviePlayerRef } from '../../components/movie/MoviePlayer';

const MovieCard = () => {
  const playerRef = useRef<MoviePlayerRef>(null);
  const [movie, setMovie] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const handlePlayPause = () => {
    if (playerRef.current) {
      if (playerRef.current.isPlaying) {
        playerRef.current.pause();
      } else {
        playerRef.current.play();
      }
    }
  };

  const handleStop = () => {
    playerRef.current?.stop();
  };

  return (
    <div>
      <div style={{ width: '600px', aspectRatio: '16/9' }}>
        <MoviePlayer
          ref={playerRef}
          movie={movie}
          autoPlay={false}
          loop={false}
          headless={false}
          onPlayStateChange={setIsPlaying}
        />
      </div>
      
      {/* Custom Controls */}
      <div style={{ marginTop: '1rem', display: 'flex', gap: '1rem' }}>
        <button onClick={handlePlayPause}>
          {isPlaying ? '⏸️ Pause' : '▶️ Play'}
        </button>
        <button onClick={handleStop}>
          ⏹️ Stop
        </button>
      </div>
    </div>
  );
};
```

**Result:** Manual playback control with play/pause/stop buttons.

---

### Example 3: Auto-play with Event Handling

```tsx
const GalleryCard = () => {
  const [movie, setMovie] = useState(null);

  const handleComplete = () => {
    console.log('Movie finished!');
    // Navigate to next movie, show modal, etc.
  };

  const handlePlayStateChange = (isPlaying: boolean) => {
    console.log('Play state:', isPlaying ? 'Playing' : 'Paused');
    // Update UI, analytics, etc.
  };

  return (
    <MoviePlayer
      movie={movie}
      autoPlay={true}
      loop={false}
      onComplete={handleComplete}
      onPlayStateChange={handlePlayStateChange}
    />
  );
};
```

**Result:** Auto-plays once, fires events for tracking.

---

### Example 4: Conditional Auto-play

```tsx
const FeaturedMovie = () => {
  const [movie, setMovie] = useState(null);
  const [userPrefersAutoplay, setUserPrefersAutoplay] = useState(
    localStorage.getItem('autoplay') === 'true'
  );

  return (
    <MoviePlayer
      movie={movie}
      autoPlay={userPrefersAutoplay}
      loop={true}
      headless={true}
    />
  );
};
```

**Result:** Respects user preference for auto-play.

---

## Studio Settings from Movie

The MoviePlayer now uses `movie.studio_settings` if available:

```typescript
// Movie record with custom settings
const movie = {
  id: 'movie-123',
  effect_type: 'gravity',
  effect_config: { /* gravity settings */ },
  studio_settings: {
    material: {
      color: '#ff6b6b',
      metalness: 0.8,
      roughness: 0.2,
      opacity: 1.0
    },
    lights: {
      brightness: 1.0,
      directional: [2.0, 1.5, 1.0, 0.5, 0.2],
      hdr: { enabled: true, envId: 'sunset', intensity: 1.5 },
      shadows: { enabled: true, intensity: 0.8 },
      backgroundColor: '#ffd700'
    },
    camera: {
      projection: 'perspective',
      fovDeg: 60,
      orthoZoom: 1.0
    },
    // ... rest of settings
  }
};

// MoviePlayer will use these settings automatically
<MoviePlayer movie={movie} />
```

**If `studio_settings` is not present**, it falls back to default settings.

---

## State Flow

```
User Action → MoviePlayer
    ↓
Effect plays/pauses
    ↓
onPlayStateChange(true/false) → Parent Component
    ↓
Parent updates UI
```

---

## Integration Checklist

✅ **HomePage** - Auto-play + Loop ✓ (already integrated)  
✅ **Movie Pages** - Can now use MoviePlayer with controls  
✅ **Gallery Cards** - Can show preview with auto-play  
✅ **Custom Controls** - Exposed via ref API  
✅ **Settings** - Uses movie.studio_settings  

---

## Next Steps

1. **Add Turntable/Reveal support** - Currently only Gravity
2. **Movie Pages integration** - Replace scene setup with MoviePlayer
3. **TransportBar integration** - Connect TransportBar to MoviePlayer ref
4. **Settings UI** - Allow live editing of studio_settings

---

## Testing

### Test Auto-play + Loop (Homepage):
1. Go to `/`
2. Movie should start playing automatically
3. Should loop when complete
4. Uses movie's studio_settings (if available)

### Test Manual Controls:
1. Create component with ref
2. Click Play → movie starts
3. Click Pause → movie pauses
4. Click Play → movie continues from pause
5. Click Stop → movie resets

### Test State Callbacks:
1. Add `onPlayStateChange` handler
2. Check console for state changes
3. Verify UI updates with state
