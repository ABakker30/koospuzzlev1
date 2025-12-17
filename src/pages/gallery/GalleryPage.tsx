import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PuzzleCard } from './PuzzleCard';
import { SolutionCard } from './SolutionCard';
import { EditSolutionModal } from './EditSolutionModal';
import { PuzzleActionModal } from './PuzzleActionModal';
import { SolutionActionModal } from './SolutionActionModal';
import type { IJK } from '../../types/shape';
import { getPublicPuzzles, getMyPuzzles, deletePuzzle, type PuzzleRecord } from '../../api/puzzles';
import { getPublicSolutions, deleteSolution, updateSolution, type SolutionRecord } from '../../api/solutionsGallery';

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
  const [searchParams] = useSearchParams();
  
  // Read initial tab from URL parameter (e.g., ?tab=movies)
  const initialTab = (searchParams.get('tab') as TabMode) || 'public';
  const [activeTab, setActiveTab] = useState<TabMode>(initialTab);
  
  const [puzzles, setPuzzles] = useState<PuzzleMetadata[]>([]);
  const [movies, setMovies] = useState<SolutionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Edit modal state
  const [editingMovie, setEditingMovie] = useState<SolutionRecord | null>(null);
  
  // Puzzle action modal state
  const [selectedPuzzle, setSelectedPuzzle] = useState<PuzzleMetadata | null>(null);
  
  // Movie action modal state
  const [selectedMovie, setSelectedMovie] = useState<SolutionRecord | null>(null);
  
  // Management mode state (toggled by pressing "M" key)
  const [managementMode, setManagementMode] = useState(false);
  
  // Keyboard listener for "M" key to toggle management buttons
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === 'm' || e.key === 'M') {
        // Don't trigger if user is typing in an input field
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
          return;
        }
        
        setManagementMode(prev => {
          const newMode = !prev;
          console.log(`🔧 Management mode ${newMode ? 'ENABLED' : 'DISABLED'}`);
          return newMode;
        });
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, []);
  
  
  // Update tab when URL parameter changes
  useEffect(() => {
    const tab = searchParams.get('tab') as TabMode;
    if (tab && tab !== activeTab) {
      setActiveTab(tab);
      console.log('🎬 Gallery tab changed via URL:', tab);
    }
  }, [searchParams]);

  // Handle shared puzzle/movie links from URL parameters
  useEffect(() => {
    const puzzleId = searchParams.get('puzzle');
    const movieId = searchParams.get('movie');
    const isShared = searchParams.get('shared') === 'true';

    if (isShared && puzzleId && puzzles.length > 0) {
      // Find and open puzzle modal
      const puzzle = puzzles.find(p => p.id === puzzleId);
      if (puzzle) {
        setSelectedPuzzle(puzzle);
      }
    } else if (isShared && movieId && movies.length > 0) {
      // Find and open movie modal
      const movie = movies.find(m => m.id === movieId);
      if (movie) {
        setSelectedMovie(movie);
        // Switch to movies tab if not already there
        if (activeTab !== 'movies') {
          setActiveTab('movies');
        }
      }
    }
  }, [searchParams, puzzles, movies, activeTab]);
  
  // Load content based on active tab
  useEffect(() => {
    const loadContent = async () => {
      console.log('🔄 Gallery loading content for tab:', activeTab);
      setLoading(true);
      setError(null);
      
      try {
        if (activeTab === 'movies') {
          // Load movies
          console.log('📽️ Loading movies...');
          const movieRecords = await getPublicSolutions();
          console.log('✅ Loaded', movieRecords.length, 'movies');
          setMovies(movieRecords);
          setPuzzles([]); // Clear puzzles
        } else {
          // Load puzzles
          console.log('🧩 Loading puzzles for tab:', activeTab);
          
          // Add 5-second timeout to database queries
          const timeoutPromise = new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('Database query timeout')), 5000)
          );
          
          let records: PuzzleRecord[];
          
          try {
            if (activeTab === 'mine') {
              console.log('📂 Fetching user puzzles...');
              records = await Promise.race([getMyPuzzles(), timeoutPromise]);
            } else {
              console.log('🌐 Fetching public puzzles...');
              records = await Promise.race([getPublicPuzzles(), timeoutPromise]);
            }
            
            console.log('✅ Loaded', records.length, 'puzzle records');
          } catch (dbError: any) {
            if (dbError.message === 'Database query timeout') {
              console.warn('⚠️ Database query timed out - using mock data');
              throw new Error('Database unavailable - showing sample puzzles');
            }
            throw dbError;
          }
          
          // Transform PuzzleRecord to PuzzleMetadata
          const transformed = records.map(record => ({
            id: record.id,
            name: record.name,
            creator: record.creator_name,
            creatorId: record.creator_name, // Using creator_name as ID for now
            cells: [], // Will load from shape_id when displaying 3D
            thumbnailUrl: record.thumbnail_url,
            cellCount: record.shape_size // Cell count from contracts_shapes join
          }));
          
          console.log('📦 Transformed', transformed.length, 'puzzles');
          setPuzzles(transformed);
          setMovies([]); // Clear movies
        }
      } catch (err) {
        console.error('❌ Failed to load content:', err);
        setError(err instanceof Error ? err.message : 'Failed to load content');
        // Fallback to mock data on error for puzzles
        if (activeTab !== 'movies') {
          console.log('⚠️ Using mock puzzles as fallback');
          setPuzzles(MOCK_PUZZLES);
        }
      } finally {
        setLoading(false);
        console.log('✅ Gallery loading complete');
      }
    };
    
    loadContent();
  }, [activeTab]);
  
  const filteredPuzzles = puzzles;

  return (
    <div className="gallery-page" style={{
      minHeight: '100vh',
      height: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%)',
      padding: '80px 20px 40px 20px',
      overflowY: 'auto',
      overflowX: 'hidden',
      position: 'relative'
    }}>
      {/* Home Button - Top Right */}
      <button
        onClick={() => (window.location.href = '/')}
        style={{
          position: 'fixed',
          top: '20px',
          right: '40px',
          background: 'rgba(255,255,255,0.3)',
          backdropFilter: 'blur(10px)',
          border: '2px solid rgba(255,255,255,0.5)',
          borderRadius: '12px',
          padding: '0.75rem 1.5rem',
          color: '#fff',
          fontSize: '1rem',
          fontWeight: 600,
          cursor: 'pointer',
          transition: 'all 0.2s',
          boxShadow: '0 4px 16px rgba(255,255,255,0.2)',
          textShadow: '0 2px 4px rgba(0,0,0,0.2)',
          zIndex: 1000
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(255,255,255,0.5)';
          e.currentTarget.style.transform = 'scale(1.05)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'rgba(255,255,255,0.3)';
          e.currentTarget.style.transform = 'scale(1)';
        }}
      >
        🏠 Home
      </button>


      {/* Header */}
      <div style={{
        maxWidth: '1400px',
        margin: '0 auto 40px auto'
      }}>
        <h1 style={{
          color: '#fff',
          fontSize: '2.5rem',
          fontWeight: 700,
          marginBottom: '8px',
          textShadow: '0 2px 10px rgba(0,0,0,0.3)'
        }}>
          {activeTab === 'movies' ? 'KOOS Solutions Gallery' : 'KOOS Puzzle Gallery'}
        </h1>
        <p style={{
          color: 'rgba(255,255,255,0.9)',
          fontSize: '1.1rem',
          marginBottom: '24px',
          textShadow: '0 2px 8px rgba(0,0,0,0.2)'
        }}>
          {activeTab === 'movies' 
            ? 'Watch amazing puzzle solutions and challenges' 
            : 'Explore and solve community puzzles'}
        </p>
        
        {/* Tabs */}
        <div className="gallery-header-tabs" style={{
          display: 'flex',
          gap: '8px',
          borderBottom: '2px solid rgba(255, 255, 255, 0.3)',
          alignItems: 'center',
          justifyContent: 'flex-start',
          flexWrap: 'wrap',
          paddingBottom: '8px'
        }}>
          <div style={{ display: 'flex', gap: '8px', flex: '0 0 auto' }}>
            <button
              onClick={() => setActiveTab('public')}
              style={{
                background: 'none',
                border: 'none',
                color: activeTab === 'public' ? '#fff' : 'rgba(255,255,255,0.6)',
                fontSize: '1rem',
                fontWeight: 600,
                padding: '12px 24px',
                cursor: 'pointer',
                borderBottom: activeTab === 'public' ? '3px solid #feca57' : '2px solid transparent',
                marginBottom: '-2px',
                transition: 'all 0.2s ease',
                textShadow: activeTab === 'public' ? '0 2px 8px rgba(0,0,0,0.3)' : 'none'
              }}
            >
              {activeTab === 'movies' ? 'Public Solutions' : 'Public Puzzles'}
            </button>
            <button
              onClick={() => setActiveTab('mine')}
              style={{
                background: 'none',
                border: 'none',
                color: activeTab === 'mine' ? '#fff' : 'rgba(255,255,255,0.6)',
                fontSize: '1rem',
                fontWeight: 600,
                padding: '12px 24px',
                cursor: 'pointer',
                borderBottom: activeTab === 'mine' ? '3px solid #feca57' : '2px solid transparent',
                marginBottom: '-2px',
                transition: 'all 0.2s ease',
                textShadow: activeTab === 'mine' ? '0 2px 8px rgba(0,0,0,0.3)' : 'none'
              }}
            >
              {activeTab === 'movies' ? 'My Solutions' : 'My Puzzles'}
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
          <p style={{ fontSize: '1.1rem' }}>{activeTab === 'movies' ? 'Loading solutions...' : 'Loading puzzles...'}</p>
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
          gap: '24px',
          paddingBottom: '120px'
        }}>
          {activeTab === 'movies'
            ? movies.map((solution) => (
                <SolutionCard
                  key={solution.id}
                  solution={solution}
                  onSelect={() => setSelectedMovie(solution)}
                  onEdit={managementMode ? () => setEditingMovie(solution) : undefined}
                  onDelete={
                    managementMode
                      ? async () => {
                          if (!window.confirm('Delete this solution?')) return;
                          try {
                            await deleteSolution(solution.id);
                            const updated = await getPublicSolutions();
                            setMovies(updated);
                          } catch (err) {
                            console.error('❌ Failed to delete solution:', err);
                            setError('Failed to delete solution');
                          }
                        }
                      : undefined
                  }
                  showManagementButtons={managementMode}
                />
              ))
            : filteredPuzzles.map((puzzle) => (
                <PuzzleCard
                  key={puzzle.id}
                  puzzle={puzzle}
                  onSelect={() => setSelectedPuzzle(puzzle)}
                  onDelete={
                    managementMode
                      ? async () => {
                          if (!window.confirm('Delete this puzzle?')) return;
                          try {
                            await deletePuzzle(puzzle.id);
                            const updatedPuzzles = await getPublicPuzzles();
                            const converted = updatedPuzzles.map((p) => ({
                              id: p.id,
                              name: p.name,
                              creator: p.creator_name,
                              cells: [],
                              cellCount: p.shape_size
                            }));
                            setPuzzles(converted);
                          } catch (err) {
                            console.error('❌ Failed to delete puzzle:', err);
                            setError('Failed to delete puzzle');
                          }
                        }
                      : undefined
                  }
                  showManagementButtons={managementMode}
                />
              ))}
        </div>
      )}

      {/* Edit Solution Modal */}
      {editingMovie && (
        <EditSolutionModal
          isOpen={true}
          solution={editingMovie}
          onClose={() => setEditingMovie(null)}
          onSave={async (updates) => {
            try {
              await updateSolution(editingMovie.id, updates);
              const updated = await getPublicSolutions();
              setMovies(updated);
              setEditingMovie(null);
            } catch (err) {
              console.error('❌ Failed to update solution:', err);
              setError('Failed to update solution');
            }
          }}
        />
      )}

      {/* Solution Action Modal */}
      {selectedMovie && (
        <SolutionActionModal
          isOpen={true}
          onClose={() => setSelectedMovie(null)}
          solution={selectedMovie}
        />
      )}

      {/* Puzzle Action Modal */}
      {selectedPuzzle && (
        <PuzzleActionModal
          isOpen={true}
          onClose={() => setSelectedPuzzle(null)}
          puzzle={selectedPuzzle}
        />
      )}
    </div>
  );
}
