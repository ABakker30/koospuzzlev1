import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PuzzleCard } from './PuzzleCard';
import { MovieCard } from './MovieCard';
import { EditPuzzleModal } from './EditPuzzleModal';
import { EditMovieModal } from './EditMovieModal';
import type { IJK } from '../../types/shape';
import { getPublicPuzzles, getMyPuzzles, getPuzzleById, deletePuzzle, updatePuzzle, type PuzzleRecord } from '../../api/puzzles';
import { getPublicMovies, getMyMovies, getMovieById, deleteMovie, updateMovie, type MovieRecord } from '../../api/movies';

interface PuzzleMetadata {
  id: string;
  name: string;
  creator: string;
  creatorId?: string;
  cells: IJK[];
  thumbnailUrl?: string;
  cellCount?: number; // For display when cells aren't loaded yet
}

type TabMode = 'public' | 'mine' | 'movies';

// Mock data for development
const MOCK_PUZZLES: PuzzleMetadata[] = [
  {
    id: '1',
    name: 'Simple Cube',
    creator: 'Demo',
    creatorId: 'user123',
    cells: [
      { i: 0, j: 0, k: 0 }, { i: 1, j: 0, k: 0 }, { i: 0, j: 1, k: 0 }, { i: 1, j: 1, k: 0 },
      { i: 0, j: 0, k: 1 }, { i: 1, j: 0, k: 1 }, { i: 0, j: 1, k: 1 }, { i: 1, j: 1, k: 1 }
    ]
  },
  {
    id: '2',
    name: 'Tower',
    creator: 'Demo',
    creatorId: 'user123',
    cells: [
      { i: 0, j: 0, k: 0 }, { i: 0, j: 1, k: 0 }, { i: 0, j: 2, k: 0 },
      { i: 0, j: 0, k: 1 }, { i: 0, j: 1, k: 1 }, { i: 0, j: 2, k: 1 }
    ]
  },
  {
    id: '3',
    name: 'L-Shape',
    creator: 'Alice',
    creatorId: 'other-user',
    cells: [
      { i: 0, j: 0, k: 0 }, { i: 1, j: 0, k: 0 }, { i: 2, j: 0, k: 0 },
      { i: 0, j: 1, k: 0 }, { i: 0, j: 2, k: 0 }
    ]
  }
];

export default function GalleryPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  // Read initial tab from URL parameter (e.g., ?tab=movies)
  const initialTab = (searchParams.get('tab') as TabMode) || 'public';
  const [activeTab, setActiveTab] = useState<TabMode>(initialTab);
  
  const [puzzles, setPuzzles] = useState<PuzzleMetadata[]>([]);
  const [movies, setMovies] = useState<MovieRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCopiedToast, setShowCopiedToast] = useState(false);
  
  // Edit modal state
  const [editingPuzzle, setEditingPuzzle] = useState<PuzzleRecord | null>(null);
  const [editingMovie, setEditingMovie] = useState<MovieRecord | null>(null);
  
  const handleShare = async () => {
    const url = `${window.location.origin}/gallery`;
    try {
      await navigator.clipboard.writeText(url);
      setShowCopiedToast(true);
      setTimeout(() => setShowCopiedToast(false), 3000);
    } catch (err) {
      console.error('Failed to copy link:', err);
    }
  };
  
  // Update tab when URL parameter changes
  useEffect(() => {
    const tab = searchParams.get('tab') as TabMode;
    if (tab && tab !== activeTab) {
      setActiveTab(tab);
      console.log('🎬 Gallery tab changed via URL:', tab);
    }
  }, [searchParams]);
  
  // Load content based on active tab
  useEffect(() => {
    const loadContent = async () => {
      setLoading(true);
      setError(null);
      
      try {
        if (activeTab === 'movies') {
          // Load movies
          const movieRecords = await getPublicMovies();
          setMovies(movieRecords);
          setPuzzles([]); // Clear puzzles
        } else {
          // Load puzzles
          let records: PuzzleRecord[];
          
          if (activeTab === 'mine') {
            records = await getMyPuzzles();
          } else {
            records = await getPublicPuzzles();
          }
          
          // Transform PuzzleRecord to PuzzleMetadata
          const transformed: PuzzleMetadata[] = records.map(record => ({
            id: record.id,
            name: record.name,
            creator: record.creator_name,
            creatorId: record.creator_name, // Using creator_name as ID for now
            cells: [], // Will load from shape_id when displaying 3D
            thumbnailUrl: undefined,
            cellCount: record.shape_size // Cell count from contracts_shapes join
          }));
          
          setPuzzles(transformed);
          setMovies([]); // Clear movies
        }
      } catch (err) {
        console.error('Failed to load content:', err);
        setError(err instanceof Error ? err.message : 'Failed to load content');
        // Fallback to mock data on error for puzzles
        if (activeTab !== 'movies') {
          setPuzzles(MOCK_PUZZLES);
        }
      } finally {
        setLoading(false);
      }
    };
    
    loadContent();
  }, [activeTab]);
  
  const filteredPuzzles = puzzles;

  return (
    <div className="gallery-page" style={{
      minHeight: '100vh',
      height: '100vh',
      background: 'linear-gradient(to bottom, #0a0a0a, #1a1a1a)',
      padding: '80px 20px 40px 20px',
      overflowY: 'auto',
      overflowX: 'hidden'
    }}>
      {/* Header */}
      <div style={{
        maxWidth: '1400px',
        margin: '0 auto 40px auto'
      }}>
        <h1 style={{
          color: '#fff',
          fontSize: '2.5rem',
          fontWeight: 700,
          marginBottom: '8px'
        }}>
          {activeTab === 'movies' ? '🎬 Movie Gallery' : 'KOOS Puzzle Gallery'}
        </h1>
        <p style={{
          color: '#888',
          fontSize: '1.1rem',
          marginBottom: '24px'
        }}>
          {activeTab === 'movies' 
            ? 'Watch amazing puzzle solutions and challenges' 
            : 'Explore and solve community puzzles'}
        </p>
        
        {/* Tabs */}
        <div className="gallery-header-tabs" style={{
          display: 'flex',
          gap: '8px',
          borderBottom: '2px solid rgba(255, 255, 255, 0.1)',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          paddingBottom: '8px'
        }}>
          <div style={{ display: 'flex', gap: '8px', flex: '0 0 auto' }}>
            <button
              onClick={() => setActiveTab('public')}
              style={{
                background: 'none',
                border: 'none',
                color: activeTab === 'public' ? '#fff' : '#666',
                fontSize: '1rem',
                fontWeight: 600,
                padding: '12px 24px',
                cursor: 'pointer',
                borderBottom: activeTab === 'public' ? '2px solid #4a9eff' : '2px solid transparent',
                marginBottom: '-2px',
                transition: 'all 0.2s ease'
              }}
            >
              Public Puzzles
            </button>
            <button
              onClick={() => setActiveTab('mine')}
              style={{
                background: 'none',
                border: 'none',
                color: activeTab === 'mine' ? '#fff' : '#666',
                fontSize: '1rem',
                fontWeight: 600,
                padding: '12px 24px',
                cursor: 'pointer',
                borderBottom: activeTab === 'mine' ? '2px solid #4a9eff' : '2px solid transparent',
                marginBottom: '-2px',
                transition: 'all 0.2s ease'
              }}
            >
              My Puzzles
            </button>
            <button
              onClick={() => setActiveTab('movies')}
              style={{
                background: 'none',
                border: 'none',
                color: activeTab === 'movies' ? '#fff' : '#666',
                fontSize: '1rem',
                fontWeight: 600,
                padding: '12px 24px',
                cursor: 'pointer',
                borderBottom: activeTab === 'movies' ? '2px solid #9c27b0' : '2px solid transparent',
                marginBottom: '-2px',
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <span>🎬</span>
              Movies
            </button>
          </div>
          
          {/* Action Buttons */}
          <div style={{ 
            display: 'flex', 
            gap: '8px', 
            alignItems: 'center',
            flexWrap: 'wrap'
          }}>
            <button
              onClick={handleShare}
              style={{
                background: 'rgba(255, 255, 255, 0.08)',
                border: '2px solid rgba(255, 255, 255, 0.15)',
                color: '#fff',
                fontSize: 'clamp(0.75rem, 2.5vw, 0.9rem)',
                fontWeight: 600,
                padding: 'clamp(8px, 2vw, 10px) clamp(12px, 3vw, 20px)',
                borderRadius: '12px',
                cursor: 'pointer',
                transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
                marginBottom: '-2px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.12)';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.25)';
                e.currentTarget.style.transform = 'translateY(-3px) scale(1.02)';
                e.currentTarget.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.3)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)';
                e.currentTarget.style.transform = 'translateY(0) scale(1)';
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.2)';
              }}
            >
              <span style={{ fontSize: '1.1rem' }}>🔗</span>
              Share
            </button>
            
            <button
              onClick={() => navigate('/create')}
              style={{
                background: 'linear-gradient(135deg, #4a9eff 0%, #357abd 100%)',
                border: 'none',
                color: '#fff',
                fontSize: 'clamp(0.8rem, 2.5vw, 0.95rem)',
                fontWeight: 600,
                padding: 'clamp(9px, 2vw, 11px) clamp(16px, 3vw, 24px)',
                borderRadius: '12px',
                cursor: 'pointer',
                transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
                marginBottom: '-2px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 4px 12px rgba(74, 158, 255, 0.3)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-3px) scale(1.05)';
                e.currentTarget.style.boxShadow = '0 8px 24px rgba(74, 158, 255, 0.5)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0) scale(1)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(74, 158, 255, 0.3)';
              }}
            >
              <span style={{ fontSize: 'clamp(1.1rem, 3vw, 1.3rem)', lineHeight: 1 }}>+</span>
              <span style={{ 
                display: 'inline',
              }}>Create</span>
              <span style={{ 
                display: 'none',
              }} className="button-full-text"> Puzzle</span>
            </button>
          </div>
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div style={{
          maxWidth: '1400px',
          margin: '0 auto',
          textAlign: 'center',
          padding: '60px 20px',
          color: '#888'
        }}>
          <div style={{
            fontSize: '2rem',
            marginBottom: '16px'
          }}>
            ⏳
          </div>
          <p style={{ fontSize: '1.1rem' }}>Loading puzzles...</p>
        </div>
      )}

      {/* Error State */}
      {error && !loading && (
        <div style={{
          maxWidth: '1400px',
          margin: '0 auto',
          textAlign: 'center',
          padding: '60px 20px',
          color: '#ff6b6b'
        }}>
          <p style={{ fontSize: '1.1rem', marginBottom: '8px' }}>⚠️ {error}</p>
          <p style={{ fontSize: '0.9rem', color: '#888' }}>Showing sample puzzles instead</p>
        </div>
      )}

      {/* Gallery Grid */}
      {!loading && (
        <div style={{
          maxWidth: '1400px',
          margin: '0 auto',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: '24px'
        }}>
          {activeTab === 'movies' ? (
            // Render movies
            movies.map(movie => (
              <MovieCard
                key={movie.id}
                movie={movie}
                onSelect={(id: string) => {
                  // Load movie and start playback
                  navigate(`/solve/${movie.puzzle_id}?movie=${id}`);
                }}
                onEdit={async (id: string) => {
                  console.log('🎬 Edit movie:', id);
                  try {
                    const fullMovie = await getMovieById(id);
                    if (fullMovie) {
                      setEditingMovie(fullMovie);
                    }
                  } catch (err) {
                    console.error('Failed to load movie:', err);
                    alert('Failed to load movie data');
                  }
                }}
                onDelete={async (id: string) => {
                  console.log('🗑️ Delete movie:', id);
                  try {
                    setLoading(true);
                    await deleteMovie(id);
                    console.log('✅ Movie deleted successfully');
                    // Reload movies after deletion
                    const updatedMovies = await getPublicMovies();
                    setMovies(updatedMovies);
                    setError(null);
                  } catch (err) {
                    console.error('❌ Failed to delete movie:', err);
                    setError('Failed to delete movie');
                    alert('Failed to delete movie. Check console for details.');
                  } finally {
                    setLoading(false);
                  }
                }}
              />
            ))
          ) : (
            // Render puzzles
            filteredPuzzles.map(puzzle => (
              <PuzzleCard
                key={puzzle.id}
                puzzle={puzzle}
                onSelect={(id: string) => {
                  navigate(`/solve/${id}`);
                }}
                onEdit={async (id: string) => {
                  console.log('✏️ Edit puzzle:', id);
                  try {
                    const fullPuzzle = await getPuzzleById(id);
                    if (fullPuzzle) {
                      setEditingPuzzle(fullPuzzle);
                    }
                  } catch (err) {
                    console.error('Failed to load puzzle:', err);
                    alert('Failed to load puzzle data');
                  }
                }}
                onDelete={async (id: string) => {
                  console.log('🗑️ Delete puzzle:', id);
                  try {
                    setLoading(true);
                    await deletePuzzle(id);
                    console.log('✅ Puzzle deleted successfully');
                    // Reload puzzles after deletion
                    const updatedPuzzles = await getPublicPuzzles();
                    // Convert to PuzzleMetadata format
                    const converted = updatedPuzzles.map(p => ({
                      id: p.id,
                      name: p.name,
                      creator: p.creator_name,
                      cells: [], // We don't need actual cells for display
                      cellCount: p.shape_size
                    }));
                    setPuzzles(converted);
                    setError(null);
                  } catch (err) {
                    console.error('❌ Failed to delete puzzle:', err);
                    setError('Failed to delete puzzle');
                    alert('Failed to delete puzzle. Check console for details.');
                  } finally {
                    setLoading(false);
                  }
                }}
              />
            ))
          )}
        </div>
      )}

      {/* Empty state */}
      {!loading && (activeTab === 'movies' ? movies.length === 0 : filteredPuzzles.length === 0) && (
        <div style={{
          textAlign: 'center',
          padding: '60px 20px',
          color: '#666'
        }}>
          {activeTab === 'movies' ? (
            <>
              <p style={{ fontSize: '2rem', marginBottom: '16px' }}>🎬</p>
              <p style={{ fontSize: '1.2rem', marginBottom: '8px' }}>No movies yet</p>
              <p style={{ fontSize: '0.9rem', color: '#888' }}>Create a movie by recording a puzzle solve!</p>
            </>
          ) : activeTab === 'mine' ? (
            <>
              <p style={{ fontSize: '1.2rem', marginBottom: '16px' }}>No puzzles created yet</p>
              <button
                onClick={() => navigate('/create')}
                style={{
                  background: 'linear-gradient(135deg, #4a9eff 0%, #357abd 100%)',
                  border: 'none',
                  color: '#fff',
                  fontSize: '1rem',
                  fontWeight: 600,
                  padding: '12px 32px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 8px 16px rgba(74, 158, 255, 0.4)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <span style={{ fontSize: '1.5rem' }}>+</span>
                Create Your First Puzzle
              </button>
            </>
          ) : (
            <p style={{ fontSize: '1.2rem' }}>No public puzzles available</p>
          )}
        </div>
      )}
      
      {/* Copy Success Toast */}
      {showCopiedToast && (
        <div style={{
          position: 'fixed',
          bottom: '32px',
          right: '32px',
          background: 'linear-gradient(135deg, #4a9eff 0%, #357abd 100%)',
          color: '#fff',
          padding: '16px 24px',
          borderRadius: '12px',
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          fontSize: '1rem',
          fontWeight: 600,
          zIndex: 1000,
          animation: 'slideIn 0.3s ease'
        }}>
          <span style={{ fontSize: '1.4rem' }}>✓</span>
          Link copied to clipboard!
        </div>
      )}

      {/* Edit Puzzle Modal */}
      {editingPuzzle && (
        <EditPuzzleModal
          isOpen={true}
          puzzle={editingPuzzle}
          onClose={() => setEditingPuzzle(null)}
          onSave={async (updates) => {
            await updatePuzzle(editingPuzzle.id, updates);
            console.log('✅ Puzzle updated successfully');
            // Reload puzzles
            const updatedPuzzles = await getPublicPuzzles();
            const converted = updatedPuzzles.map(p => ({
              id: p.id,
              name: p.name,
              creator: p.creator_name,
              cells: [],
              cellCount: p.shape_size
            }));
            setPuzzles(converted);
            setEditingPuzzle(null);
          }}
        />
      )}

      {/* Edit Movie Modal */}
      {editingMovie && (
        <EditMovieModal
          isOpen={true}
          movie={editingMovie}
          onClose={() => setEditingMovie(null)}
          onSave={async (updates) => {
            await updateMovie(editingMovie.id, updates);
            console.log('✅ Movie updated successfully');
            // Reload movies
            const updatedMovies = await getPublicMovies();
            setMovies(updatedMovies);
            setEditingMovie(null);
          }}
        />
      )}
    </div>
  );
}
