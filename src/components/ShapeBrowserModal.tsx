import React, { useState, useEffect, useCallback, useRef } from 'react';
import '../styles/ShapeBrowserModal.css';

interface ShapeFile {
  filename: string;
  path: string;
  pieceCount?: number;
  cellCount?: number;
  fileSize?: number;
  dateModified?: Date;
  description?: string;
  tags?: string[];
}

interface ShapeBrowserModalProps {
  isOpen: boolean;
  files: ShapeFile[];
  initialIndex?: number;
  title?: string; // Optional title to distinguish shapes vs solutions
  onSelect: (file: ShapeFile) => void;
  onClose: () => void;
  onLoadShape: (file: ShapeFile) => Promise<void>;
  onDelete?: (file: ShapeFile) => Promise<void>;
  onRename?: (file: ShapeFile, newName: string) => Promise<void>;
  onUpdateMetadata?: (file: ShapeFile, metadata: Partial<ShapeFile>) => Promise<void>;
}

export const ShapeBrowserModal: React.FC<ShapeBrowserModalProps> = ({
  isOpen,
  files,
  initialIndex = 0,
  title,
  onSelect,
  onClose,
  onLoadShape,
  onDelete,
  onRename,
  onUpdateMetadata
}) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [loading, setLoading] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [editedFilename, setEditedFilename] = useState('');
  const [editedDescription, setEditedDescription] = useState('');
  const [editedTags, setEditedTags] = useState('');
  const forceReloadRef = useRef(false);

  const currentFile = files[currentIndex];
  const canEdit = !!(onRename || onUpdateMetadata);
  const canDelete = !!onDelete;

  // Load shape when index changes
  useEffect(() => {
    if (!isOpen) return;
    
    const fileToLoad = files[currentIndex]; // Get file directly from array
    if (!fileToLoad) return;
    
    let cancelled = false;
    
    const loadShape = async () => {
      setLoading(true);
      try {
        await onLoadShape(fileToLoad);
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to load shape:', error);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    
    loadShape();
    forceReloadRef.current = false;
    
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, isOpen]); // Intentionally not including files/onLoadShape to prevent infinite loop
  
  // Separate effect to watch for force reload (after files array updates)
  useEffect(() => {
    if (!forceReloadRef.current || !currentFile) return;
    
    const loadShape = async () => {
      setLoading(true);
      try {
        await onLoadShape(currentFile);
      } catch (error) {
        console.error('Failed to load shape:', error);
      } finally {
        setLoading(false);
      }
    };
    
    loadShape();
    forceReloadRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files]); // Only watch files array to detect deletions

  // Navigation
  const handlePrevious = useCallback(() => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : files.length - 1));
  }, [files.length]);

  const handleNext = useCallback(() => {
    setCurrentIndex((prev) => (prev < files.length - 1 ? prev + 1 : 0));
  }, [files.length]);

  const handleSelect = () => {
    if (currentFile) {
      onSelect(currentFile);
    }
  };

  // Edit metadata
  const handleOpenEdit = () => {
    if (!currentFile) return;
    setEditedFilename(currentFile.filename.replace('.json', ''));
    setEditedDescription(currentFile.description || '');
    setEditedTags(currentFile.tags?.join(', ') || '');
    setEditMode(true);
  };

  const handleSaveEdit = async () => {
    if (!currentFile) return;

    const newFilename = editedFilename.trim() + '.json';
    const tags = editedTags.split(',').map(t => t.trim()).filter(t => t);

    try {
      // Rename file if changed
      if (newFilename !== currentFile.filename && onRename) {
        await onRename(currentFile, newFilename);
      }

      // Update metadata
      if (onUpdateMetadata) {
        await onUpdateMetadata(currentFile, {
          description: editedDescription.trim(),
          tags: tags.length > 0 ? tags : undefined
        });
      }

      setEditMode(false);
    } catch (error) {
      console.error('Failed to save metadata:', error);
      alert('Failed to save changes. Please try again.');
    }
  };

  // Delete file
  const handleOpenDelete = () => {
    setDeleteConfirm(true);
  };

  const handleConfirmDelete = async () => {
    if (!currentFile || !onDelete) return;

    // Capture state before deletion
    const fileCountBeforeDeletion = files.length;
    const wasLastFile = currentIndex >= files.length - 1;

    try {
      await onDelete(currentFile);
      
      setDeleteConfirm(false);
      
      // After deletion, handle navigation
      if (fileCountBeforeDeletion <= 1) {
        // No more files, close modal
        onClose();
      } else if (wasLastFile) {
        // Deleted last file, move to previous
        setCurrentIndex(currentIndex - 1);
      } else {
        // Deleted middle file, new file is now at same index
        // Set flag to trigger reload when files array updates
        forceReloadRef.current = true;
      }
    } catch (error) {
      console.error('Failed to delete file:', error);
      alert('Failed to delete file. Please try again.');
    }
  };

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (editMode || deleteConfirm) return; // Don't handle if in dialog

      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          handlePrevious();
          break;
        case 'ArrowRight':
          e.preventDefault();
          handleNext();
          break;
        case 'Enter':
          e.preventDefault();
          handleSelect();
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
        case 'Delete':
          if (canDelete) {
            e.preventDefault();
            handleOpenDelete();
          }
          break;
        case 'e':
        case 'E':
        case 'F2':
          if (canEdit) {
            e.preventDefault();
            handleOpenEdit();
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, editMode, deleteConfirm, handlePrevious, handleNext, canEdit, canDelete]);

  if (!isOpen || files.length === 0) return null;
  if (!currentFile) return null;

  // Format file size
  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Format date
  const formatDate = (date?: Date) => {
    if (!date) return '';
    return new Intl.DateTimeFormat('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    }).format(date);
  };

  return (
    <div className="shape-browser-overlay">
      <div className="shape-browser-container">
        {/* Top Action Bar */}
        <div className="shape-browser-top-bar">
          <div className="shape-info">
            <div className="shape-filename">
              {title && <span style={{ opacity: 0.7, marginRight: '0.5rem' }}>{title} •</span>}
              📄 {currentFile.filename}
            </div>
            <div className="shape-metadata">
              {currentFile.pieceCount && (
                <span className="metadata-item">
                  🧩 {currentFile.pieceCount} pieces
                </span>
              )}
              {currentFile.cellCount && (
                <>
                  <span className="metadata-separator">•</span>
                  <span className="metadata-item">
                    🔵 {currentFile.cellCount} cells
                  </span>
                </>
              )}
              {currentFile.fileSize && (
                <>
                  <span className="metadata-separator">•</span>
                  <span className="metadata-item">
                    {formatFileSize(currentFile.fileSize)}
                  </span>
                </>
              )}
              {currentFile.dateModified && (
                <>
                  <span className="metadata-separator">•</span>
                  <span className="metadata-item">
                    📅 {formatDate(currentFile.dateModified)}
                  </span>
                </>
              )}
            </div>
          </div>
          
          <div className="shape-actions">
            <button 
              className="action-btn select-btn" 
              onClick={handleSelect}
              title="Select this shape (Enter)"
            >
              ✓ Select
            </button>
            {canEdit && (
              <button 
                className="action-btn edit-btn" 
                onClick={handleOpenEdit}
                title="Edit metadata (E or F2)"
              >
                ✏️ Edit
              </button>
            )}
            {canDelete && (
              <button 
                className="action-btn delete-btn" 
                onClick={handleOpenDelete}
                title="Delete file (Delete)"
              >
                🗑️ Delete
              </button>
            )}
            <button 
              className="action-btn close-btn" 
              onClick={onClose}
              title="Close (Esc)"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Preview Area (canvas is rendered in background by parent) */}
        <div className="shape-browser-preview">
          {loading && (
            <div className="loading-overlay">
              <div className="spinner"></div>
              <div>Loading shape...</div>
            </div>
          )}
        </div>

        {/* Bottom Navigation Bar */}
        <div className="shape-browser-bottom-bar">
          <button 
            className="nav-btn prev-btn" 
            onClick={handlePrevious}
            disabled={files.length <= 1}
            title="Previous (←)"
          >
            ◀ Previous
          </button>
          
          <div className="pagination">
            {currentIndex + 1} / {files.length}
          </div>
          
          <button 
            className="nav-btn next-btn" 
            onClick={handleNext}
            disabled={files.length <= 1}
            title="Next (→)"
          >
            Next ▶
          </button>
        </div>

        {/* Edit Metadata Dialog */}
        {editMode && (
          <div className="dialog-overlay">
            <div className="dialog-box edit-dialog">
              <h3>Edit Metadata</h3>
              
              <div className="form-group">
                <label>Filename (without .json)</label>
                <input
                  type="text"
                  value={editedFilename}
                  onChange={(e) => setEditedFilename(e.target.value)}
                  placeholder="my_awesome_puzzle"
                  autoFocus
                />
              </div>

              <div className="form-group">
                <label>Description (optional)</label>
                <textarea
                  value={editedDescription}
                  onChange={(e) => setEditedDescription(e.target.value)}
                  placeholder="Brief description of this shape..."
                  rows={3}
                />
              </div>

              <div className="form-group">
                <label>Tags (optional, comma-separated)</label>
                <input
                  type="text"
                  value={editedTags}
                  onChange={(e) => setEditedTags(e.target.value)}
                  placeholder="cube, beginner, 25-piece"
                />
              </div>

              <div className="dialog-actions">
                <button className="btn-secondary" onClick={() => setEditMode(false)}>
                  Cancel
                </button>
                <button className="btn-primary" onClick={handleSaveEdit}>
                  Save ✓
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete Confirmation Dialog */}
        {deleteConfirm && (
          <div className="dialog-overlay">
            <div className="dialog-box delete-dialog">
              <h3>⚠️ Delete File?</h3>
              
              <p>Are you sure you want to delete:</p>
              
              <div className="delete-file-info">
                <strong>{currentFile.filename}</strong>
                <div className="file-details">
                  {currentFile.pieceCount && `${currentFile.pieceCount} pieces`}
                  {currentFile.cellCount && ` • ${currentFile.cellCount} cells`}
                </div>
              </div>
              
              <p className="warning-text">This action cannot be undone.</p>

              <div className="dialog-actions">
                <button className="btn-secondary" onClick={() => setDeleteConfirm(false)}>
                  Cancel
                </button>
                <button className="btn-danger" onClick={handleConfirmDelete}>
                  Delete 🗑️
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
