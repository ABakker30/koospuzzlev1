import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { PuzzleCard } from './PuzzleCard';
import type { IJK } from '../../types/shape';
import { getPublicPuzzles, getMyPuzzles, type PuzzleRecord } from '../../api/puzzles';

interface PuzzleMetadata {
  id: string;
  name: string;
  creator: string;
  creatorId?: string;
  cells: IJK[];
  thumbnailUrl?: string;
  cellCount?: number; // For display when cells aren't loaded yet
}

type TabMode = 'public' | 'mine';

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
  const [activeTab, setActiveTab] = useState<TabMode>('public');
  const [puzzles, setPuzzles] = useState<PuzzleMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCopiedToast, setShowCopiedToast] = useState(false);
  
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
  
  // Load puzzles based on active tab
  useEffect(() => {
    const loadPuzzles = async () => {
      setLoading(true);
      setError(null);
      
      try {
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
      } catch (err) {
        console.error('Failed to load puzzles:', err);
        setError(err instanceof Error ? err.message : 'Failed to load puzzles');
        // Fallback to mock data on error
        setPuzzles(MOCK_PUZZLES);
      } finally {
        setLoading(false);
      }
    };
    
    loadPuzzles();
  }, [activeTab]);
  
  const filteredPuzzles = puzzles;

  return (
    <div style={{
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
          KOOS Puzzle Gallery
        </h1>
        <p style={{
          color: '#888',
          fontSize: '1.1rem',
          marginBottom: '24px'
        }}>
          Explore and solve community puzzles
        </p>
        
        {/* Tabs */}
        <div style={{
          display: 'flex',
          gap: '8px',
          borderBottom: '2px solid rgba(255, 255, 255, 0.1)',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', gap: '8px' }}>
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
          </div>
          
          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <button
              onClick={handleShare}
              style={{
                background: 'rgba(255, 255, 255, 0.08)',
                border: '2px solid rgba(255, 255, 255, 0.15)',
                color: '#fff',
                fontSize: '0.9rem',
                fontWeight: 600,
                padding: '10px 20px',
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
                fontSize: '0.95rem',
                fontWeight: 600,
                padding: '11px 24px',
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
              <span style={{ fontSize: '1.3rem', lineHeight: 1 }}>+</span>
              Create Puzzle
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
          {filteredPuzzles.map(puzzle => (
            <PuzzleCard
              key={puzzle.id}
              puzzle={puzzle}
              onSelect={(id: string) => {
                navigate(`/solve/${id}`);
              }}
            />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && filteredPuzzles.length === 0 && (
        <div style={{
          textAlign: 'center',
          padding: '60px 20px',
          color: '#666'
        }}>
          {activeTab === 'mine' ? (
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
    </div>
  );
}
