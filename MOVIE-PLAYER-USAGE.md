# MoviePlayer Component - Usage Guide

## Overview
The `MoviePlayer` is a headless, scalable, reusable component for playing movies.

## Features
✅ **Headless Mode** - No UI controls, just the 3D scene
✅ **Loop Mode** - Automatically restarts when complete
✅ **Scalable** - Fits any container size (responsive)
✅ **Auto-play** - Starts automatically on mount
✅ **Callbacks** - onComplete, onError events

## Props

```typescript
interface MoviePlayerProps {
  movie: MovieRecord;              // Movie data from database
  autoPlay?: boolean;              // Default: false
  loop?: boolean;                  // Default: false
  headless?: boolean;              // Default: true (no UI)
  onComplete?: () => void;         // Called when effect ends
  onError?: (error: string) => void;  // Called on error
  onPlayStateChange?: (isPlaying: boolean) => void;  // Called on state change
}

// Exposed via ref
interface MoviePlayerRef {
  play: () => void;      // Start/resume playback
  pause: () => void;     // Pause playback
  stop: () => void;      // Stop and reset
  isPlaying: boolean;    // Current state
}
```

## Usage Example 1: Homepage Featured Movie

```tsx
// HomePage.tsx
import { MoviePlayer } from '../../components/movie/MoviePlayer';

const HomePage = () => {
  const [featuredMovie, setFeaturedMovie] = useState(null);

  useEffect(() => {
    // Load most recent movie
    getPublicMovies().then(movies => {
      if (movies?.length > 0) {
        setFeaturedMovie(movies[0]);
      }
    });
  }, []);

  return (
    <div className="home-page">
      {/* Featured Movie Window */}
      <div style={{
        width: '100%',
        maxWidth: '900px',
        aspectRatio: '16/9',
        borderRadius: '20px',
        overflow: 'hidden'
      }}>
        {featuredMovie && (
          <MoviePlayer
            movie={featuredMovie}
            autoPlay={true}
            loop={true}
            headless={true}
          />
        )}
      </div>
    </div>
  );
};
```

## Usage Example 2: Movie Page (with controls)

```tsx
// GravityMoviePage.tsx
import { MoviePlayer } from '../../components/movie/MoviePlayer';

const GravityMoviePage = () => {
  const [movie, setMovie] = useState(null);
  const [showWhatsNext, setShowWhatsNext] = useState(false);

  return (
    <div className="movie-page">
      {/* Full-screen movie player */}
      <div style={{ width: '100vw', height: '100vh' }}>
        <MoviePlayer
          movie={movie}
          autoPlay={true}
          loop={false}
          headless={false}  // Show info overlay
          onComplete={() => setShowWhatsNext(true)}
        />
      </div>
      
      {/* Add your TransportBar, modals, etc. here */}
    </div>
  );
};
```

## Usage Example 3: Gallery Preview

```tsx
// Movie card hover preview
<div 
  className="movie-card"
  style={{ width: '300px', height: '200px' }}
>
  <MoviePlayer
    movie={movie}
    autoPlay={true}
    loop={true}
    headless={true}
  />
</div>
```

## How It Works

1. **Loads movie data** - Parses solution/placed pieces
2. **Builds 3D scene** - Uses SceneCanvas component
3. **Creates effect context** - Initializes Gravity/Turntable/Reveal effect
4. **Starts animation** - Ticks effect on every frame
5. **Handles completion** - Either loops or calls onComplete
6. **Scales automatically** - Fills parent container

## Benefits

✅ **Zero duplication** - Same logic everywhere
✅ **Easy to use** - Just pass movie data
✅ **Flexible** - Works in any size container
✅ **Composable** - Add your own UI on top
✅ **Performant** - Optimized Three.js rendering

## Next Steps

1. Fix TypeScript type definitions for MovieRecord
2. Add support for all effect types (Turntable, Reveal, Orbit, Explosion)
3. Extract effect factory pattern
4. Add playback controls (play/pause) as optional prop
5. Test in different container sizes
6. Add loading/error states customization
