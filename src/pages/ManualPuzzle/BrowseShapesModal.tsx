// Browse Shapes Modal for Manual Puzzle
// MVP: Repository shapes + local file upload

import React, { useState, useEffect } from 'react';
import type { ContainerV3 } from '../../types/lattice';
import { ShapeFileService, type ShapeListItem } from '../../services/ShapeFileService';

interface BrowseShapesModalProps {
  open: boolean;
  onClose: () => void;
  onLoaded: (container: ContainerV3, item?: ShapeListItem) => void;
}

export const BrowseShapesModal: React.FC<BrowseShapesModalProps> = ({
  open,
  onClose,
  onLoaded
}) => {
  const [activeTab, setActiveTab] = useState<'repository' | 'local'>('repository');
  const [repoShapes, setRepoShapes] = useState<ShapeListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && activeTab === 'repository') {
      loadRepositoryShapes();
    }
  }, [open, activeTab]);

  const loadRepositoryShapes = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const service = new ShapeFileService();
      const shapes = await service.listPublic();
      setRepoShapes(shapes);
      console.log(`📁 Loaded ${shapes.length} repository shapes`);
    } catch (err) {
      console.error('❌ Failed to load repository shapes:', err);
      setError('Failed to load repository shapes');
    } finally {
      setLoading(false);
    }
  };

  const handleRepoShapeClick = async (item: ShapeListItem) => {
    setLoading(true);
    setError(null);
    
    try {
      const service = new ShapeFileService();
      const shapeFile = await service.readPublic(item.path);
      
      // Convert to ContainerV3
      const container: ContainerV3 = {
        id: item.id,
        name: item.name,
        cells: shapeFile.cells as [number, number, number][]
      };
      
      console.log(`✅ Loaded shape: ${container.name} (${container.cells.length} cells)`);
      onLoaded(container, item);
      onClose();
    } catch (err) {
      console.error('❌ Failed to load shape:', err);
      setError(`Failed to load shape: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError(null);

    try {
      const text = await file.text();
      const json = JSON.parse(text);

      // Validate basic structure
      if (!json.cells || !Array.isArray(json.cells)) {
        throw new Error('Invalid container format: missing cells array');
      }

      const container: ContainerV3 = {
        id: json.id || file.name.replace('.json', ''),
        name: json.name || file.name,
        cells: json.cells,
        worldFromEngine: json.worldFromEngine,
        meta: json.meta
      };

      console.log(`✅ Loaded local file: ${container.name} (${container.cells.length} cells)`);
      onLoaded(container);
      onClose();
    } catch (err) {
      console.error('❌ Failed to parse file:', err);
      setError(`Invalid file: ${(err as Error).message}`);
    } finally {
      setLoading(false);
      event.target.value = ''; // Reset input
    }
  };

  if (!open) return null;

  return (
    <div style={backdropStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={headerStyle}>
          <h3 style={{ margin: 0, fontSize: '1.25rem' }}>Browse Shapes</h3>
          <button onClick={onClose} style={closeButtonStyle}>×</button>
        </div>

        {/* Tabs */}
        <div style={tabsContainerStyle}>
          <button
            style={{
              ...tabButtonStyle,
              ...(activeTab === 'repository' ? activeTabStyle : {})
            }}
            onClick={() => setActiveTab('repository')}
          >
            Repository
          </button>
          <button
            style={{
              ...tabButtonStyle,
              ...(activeTab === 'local' ? activeTabStyle : {})
            }}
            onClick={() => setActiveTab('local')}
          >
            Local File
          </button>
        </div>

        {/* Content */}
        <div style={contentStyle}>
          {error && (
            <div style={errorStyle}>{error}</div>
          )}

          {loading && (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>
              Loading...
            </div>
          )}

          {activeTab === 'repository' && !loading && (
            <div style={listStyle}>
              {repoShapes.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>
                  No shapes found
                </div>
              ) : (
                repoShapes.map((item) => (
                  <div
                    key={item.id}
                    style={listItemStyle}
                    onClick={() => handleRepoShapeClick(item)}
                  >
                    <div style={{ fontWeight: 500 }}>{item.name}</div>
                    <div style={{ fontSize: '0.875rem', color: '#666', marginTop: '0.25rem' }}>
                      {item.id}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'local' && !loading && (
            <div style={{ padding: '1rem' }}>
              <label style={uploadLabelStyle}>
                <input
                  type="file"
                  accept=".json"
                  onChange={handleFileUpload}
                  style={{ display: 'none' }}
                />
                <div style={uploadBoxStyle}>
                  <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📁</div>
                  <div style={{ fontWeight: 500, marginBottom: '0.25rem' }}>
                    Choose a file or drag it here
                  </div>
                  <div style={{ fontSize: '0.875rem', color: '#666' }}>
                    .json files only
                  </div>
                </div>
              </label>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Styles
const backdropStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  backgroundColor: 'rgba(0, 0, 0, 0.5)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000
};

const modalStyle: React.CSSProperties = {
  backgroundColor: '#fff',
  borderRadius: '8px',
  width: '90%',
  maxWidth: '600px',
  maxHeight: '80vh',
  display: 'flex',
  flexDirection: 'column',
  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2)'
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '1rem 1.5rem',
  borderBottom: '1px solid #eee'
};

const closeButtonStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  fontSize: '1.5rem',
  cursor: 'pointer',
  padding: '0.25rem 0.5rem',
  lineHeight: 1
};

const tabsContainerStyle: React.CSSProperties = {
  display: 'flex',
  borderBottom: '1px solid #eee'
};

const tabButtonStyle: React.CSSProperties = {
  flex: 1,
  padding: '0.75rem 1rem',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  fontSize: '0.9rem',
  color: '#666',
  borderBottom: '2px solid transparent',
  transition: 'all 0.2s'
};

const activeTabStyle: React.CSSProperties = {
  color: '#007bff',
  borderBottomColor: '#007bff',
  fontWeight: 500
};

const contentStyle: React.CSSProperties = {
  flex: 1,
  overflow: 'auto',
  minHeight: '300px'
};

const listStyle: React.CSSProperties = {
  padding: '0.5rem'
};

const listItemStyle: React.CSSProperties = {
  padding: '0.75rem 1rem',
  cursor: 'pointer',
  borderRadius: '4px',
  transition: 'background-color 0.15s'
};

const errorStyle: React.CSSProperties = {
  backgroundColor: '#fee',
  color: '#c33',
  padding: '0.75rem 1rem',
  margin: '1rem',
  borderRadius: '4px',
  fontSize: '0.875rem'
};

const uploadLabelStyle: React.CSSProperties = {
  display: 'block',
  cursor: 'pointer'
};

const uploadBoxStyle: React.CSSProperties = {
  border: '2px dashed #ddd',
  borderRadius: '8px',
  padding: '3rem 2rem',
  textAlign: 'center',
  transition: 'border-color 0.2s'
};
