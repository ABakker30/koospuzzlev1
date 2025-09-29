import { useState, useEffect } from 'react';
import type { IJK } from '../types/shape';

interface StudioFile {
  name: string;
  path: string;
  type: 'container' | 'solution';
  cells: IJK[];
}

interface StudioFileBrowserProps {
  open: boolean;
  onClose: () => void;
  onFileSelected: (file: StudioFile) => void;
}

export const StudioFileBrowser: React.FC<StudioFileBrowserProps> = ({
  open,
  onClose,
  onFileSelected
}) => {
  const [containerFiles, setContainerFiles] = useState<string[]>([]);
  const [solutionFiles, setSolutionFiles] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'containers' | 'solutions'>('containers');

  useEffect(() => {
    if (open) {
      loadFileList();
    }
  }, [open]);

  const loadFileList = async () => {
    setLoading(true);
    try {
      // Load container files
      const containerResponse = await fetch('/data/containers/v1/manifest.json');
      if (containerResponse.ok) {
        const containerManifest = await containerResponse.json();
        const containers = containerManifest.files?.map((f: any) => f.name) || [];
        setContainerFiles(containers);
      }

      // Load solution files (we'll need to hardcode these or create a manifest)
      const solutionFileNames = [
        '16_cell_container.fcc_16cell_dlx_corrected_001.json',
        'Shape_10.result1.json',
        'Shape_11.json',
        'Shape_12.json',
        'Shape_2.json',
        'Shape_3.json',
        'shape_16.current.json',
        'shape_17.result1.json',
        'shape_18.current.json',
        'shape_19.current.json'
      ];
      setSolutionFiles(solutionFileNames);
    } catch (error) {
      console.error('Failed to load file list:', error);
    }
    setLoading(false);
  };

  const loadFile = async (fileName: string, type: 'container' | 'solution') => {
    setLoading(true);
    try {
      const basePath = type === 'container' 
        ? '/data/containers/v1/' 
        : '/data/Solutions/';
      
      const response = await fetch(basePath + fileName);
      if (!response.ok) {
        throw new Error(`Failed to load file: ${response.statusText}`);
      }

      const data = await response.json();
      let cells: IJK[] = [];

      if (type === 'container') {
        // Container file format: { cells: [[i,j,k], ...] }
        cells = data.cells.map(([i, j, k]: [number, number, number]) => ({ i, j, k }));
      } else {
        // Solution file format: { placements: [{ cells_ijk: [[i,j,k], ...] }, ...] }
        cells = [];
        if (data.placements) {
          for (const placement of data.placements) {
            if (placement.cells_ijk) {
              for (const [i, j, k] of placement.cells_ijk) {
                cells.push({ i, j, k });
              }
            }
          }
        }
      }

      const file: StudioFile = {
        name: fileName,
        path: basePath + fileName,
        type,
        cells
      };

      onFileSelected(file);
      onClose();
    } catch (error) {
      console.error('Failed to load file:', error);
      alert(`Failed to load file: ${error}`);
    }
    setLoading(false);
  };

  if (!open) return null;

  return (
    <div style={backdropStyle}>
      <div style={modalStyle}>
        <div style={headerStyle}>
          <h3 style={{ margin: 0 }}>Browse Files</h3>
          <button onClick={onClose} style={closeButtonStyle}>×</button>
        </div>

        {/* Tabs */}
        <div style={tabsStyle}>
          <button
            onClick={() => setActiveTab('containers')}
            style={{
              ...tabButtonStyle,
              backgroundColor: activeTab === 'containers' ? '#007bff' : '#f8f9fa',
              color: activeTab === 'containers' ? 'white' : '#333'
            }}
          >
            Containers ({containerFiles.length})
          </button>
          <button
            onClick={() => setActiveTab('solutions')}
            style={{
              ...tabButtonStyle,
              backgroundColor: activeTab === 'solutions' ? '#007bff' : '#f8f9fa',
              color: activeTab === 'solutions' ? 'white' : '#333'
            }}
          >
            Solutions ({solutionFiles.length})
          </button>
        </div>

        {/* File List */}
        <div style={contentStyle}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '2rem' }}>Loading files...</div>
          ) : (
            <div style={fileListStyle}>
              {activeTab === 'containers' ? (
                containerFiles.length > 0 ? (
                  containerFiles.map(fileName => (
                    <div
                      key={fileName}
                      style={fileItemStyle}
                      onClick={() => loadFile(fileName, 'container')}
                    >
                      <div style={fileNameStyle}>{fileName}</div>
                      <div style={fileTypeStyle}>Container</div>
                    </div>
                  ))
                ) : (
                  <div style={{ textAlign: 'center', color: '#666' }}>No container files found</div>
                )
              ) : (
                solutionFiles.length > 0 ? (
                  solutionFiles.map(fileName => (
                    <div
                      key={fileName}
                      style={fileItemStyle}
                      onClick={() => loadFile(fileName, 'solution')}
                    >
                      <div style={fileNameStyle}>{fileName}</div>
                      <div style={fileTypeStyle}>Solution</div>
                    </div>
                  ))
                ) : (
                  <div style={{ textAlign: 'center', color: '#666' }}>No solution files found</div>
                )
              )}
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
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(0, 0, 0, 0.5)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000
};

const modalStyle: React.CSSProperties = {
  backgroundColor: 'white',
  borderRadius: '8px',
  width: '90vw',
  maxWidth: '600px',
  maxHeight: '80vh',
  display: 'flex',
  flexDirection: 'column',
  boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)'
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '16px',
  borderBottom: '1px solid #eee'
};

const closeButtonStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  fontSize: '24px',
  cursor: 'pointer',
  padding: '4px 8px'
};

const tabsStyle: React.CSSProperties = {
  display: 'flex',
  borderBottom: '1px solid #eee'
};

const tabButtonStyle: React.CSSProperties = {
  flex: 1,
  padding: '12px',
  border: 'none',
  cursor: 'pointer',
  fontSize: '14px',
  fontWeight: 500
};

const contentStyle: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  padding: '16px'
};

const fileListStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '8px'
};

const fileItemStyle: React.CSSProperties = {
  padding: '12px',
  border: '1px solid #ddd',
  borderRadius: '4px',
  cursor: 'pointer',
  transition: 'background-color 0.2s'
};

const fileNameStyle: React.CSSProperties = {
  fontWeight: 500,
  marginBottom: '4px'
};

const fileTypeStyle: React.CSSProperties = {
  fontSize: '12px',
  color: '#666',
  textTransform: 'uppercase'
};
