# ShapeBrowserModal - Usage Guide

## Overview

A carousel-style shape browser that uses the main canvas for full-quality previews with clean action bars for navigation and file management.

## Features

✅ **Full-quality preview** - Uses existing Three.js canvas  
✅ **Keyboard navigation** - Arrow keys, Enter, Esc, Delete, E/F2  
✅ **Clean UI** - Top action bar + bottom navigation bar  
✅ **Edit metadata** - Rename files, add descriptions and tags  
✅ **Delete files** - With confirmation dialog  
✅ **Mobile-friendly** - Responsive design with touch support  

## Basic Usage

```tsx
import { ShapeBrowserModal } from '../components/ShapeBrowserModal';

function MyShapePage() {
  const [browserOpen, setBrowserOpen] = useState(false);
  const [shapeFiles, setShapeFiles] = useState<ShapeFile[]>([]);

  // Load shape list from API or file system
  useEffect(() => {
    loadShapeList().then(setShapeFiles);
  }, []);

  const handleLoadShape = async (file: ShapeFile) => {
    // Use existing shape loading logic
    const shapeData = await loadShapeFromFile(file.path);
    renderShapeInCanvas(shapeData);
  };

  const handleSelectShape = (file: ShapeFile) => {
    // User confirmed selection, load and close modal
    handleLoadShape(file);
    setBrowserOpen(false);
  };

  return (
    <>
      <button onClick={() => setBrowserOpen(true)}>
        Browse Shapes
      </button>

      <ShapeBrowserModal
        isOpen={browserOpen}
        files={shapeFiles}
        onSelect={handleSelectShape}
        onClose={() => setBrowserOpen(false)}
        onLoadShape={handleLoadShape}
      />
    </>
  );
}
```

## With Edit & Delete Support

```tsx
<ShapeBrowserModal
  isOpen={browserOpen}
  files={shapeFiles}
  initialIndex={0}
  onSelect={handleSelectShape}
  onClose={() => setBrowserOpen(false)}
  onLoadShape={handleLoadShape}
  onDelete={handleDeleteFile}
  onRename={handleRenameFile}
  onUpdateMetadata={handleUpdateMetadata}
/>
```

## Handler Implementations

### Delete File

```tsx
const handleDeleteFile = async (file: ShapeFile) => {
  // Delete from server or file system
  await fetch(`/api/shapes/${file.filename}`, {
    method: 'DELETE'
  });

  // Update local list
  setShapeFiles(prev => prev.filter(f => f.filename !== file.filename));
};
```

### Rename File

```tsx
const handleRenameFile = async (file: ShapeFile, newName: string) => {
  await fetch(`/api/shapes/${file.filename}/rename`, {
    method: 'POST',
    body: JSON.stringify({ newName })
  });

  // Update local list
  setShapeFiles(prev => prev.map(f => 
    f.filename === file.filename 
      ? { ...f, filename: newName } 
      : f
  ));
};
```

### Update Metadata

```tsx
const handleUpdateMetadata = async (file: ShapeFile, metadata: Partial<ShapeFile>) => {
  // Option 1: Store in solution JSON
  const shapeData = await loadShapeFromFile(file.path);
  shapeData.metadata = { ...shapeData.metadata, ...metadata };
  await saveShapeToFile(file.path, shapeData);

  // Option 2: Store in separate .meta.json file
  await fetch(`/api/shapes/${file.filename}/metadata`, {
    method: 'PUT',
    body: JSON.stringify(metadata)
  });

  // Update local list
  setShapeFiles(prev => prev.map(f => 
    f.filename === file.filename 
      ? { ...f, ...metadata } 
      : f
  ));
};
```

## Loading Shape Files List

```tsx
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

async function loadShapeList(): Promise<ShapeFile[]> {
  // Option 1: From server API
  const response = await fetch('/api/shapes/list');
  const files = await response.json();

  // Option 2: From local file system (browser File System Access API)
  // const dirHandle = await window.showDirectoryPicker();
  // const files = await listFilesInDirectory(dirHandle);

  // Parse and extract metadata
  return Promise.all(files.map(async (file) => {
    const shapeData = await loadShapeFromFile(file.path);
    return {
      filename: file.name,
      path: file.path,
      pieceCount: shapeData.pieces?.length,
      cellCount: countCells(shapeData),
      fileSize: file.size,
      dateModified: new Date(file.lastModified),
      description: shapeData.metadata?.description,
      tags: shapeData.metadata?.tags
    };
  }));
}
```

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `←` / `→` | Previous / Next shape |
| `Enter` | Select current shape |
| `Esc` | Close browser |
| `Delete` | Delete current shape (with confirmation) |
| `E` or `F2` | Edit metadata |
| `1-9` | Jump to shape index (future) |

## Integration with Shape Page

### Replace Existing Modal

**Before:**
```tsx
<LoadShapeModal
  isOpen={loadModalOpen}
  onClose={() => setLoadModalOpen(false)}
  onSelectFile={handleLoadShape}
/>
```

**After:**
```tsx
<ShapeBrowserModal
  isOpen={loadModalOpen}
  files={shapeFiles}
  onClose={() => setLoadModalOpen(false)}
  onSelect={handleLoadShape}
  onLoadShape={handleLoadShape}
  onDelete={handleDeleteFile}
  onRename={handleRenameFile}
  onUpdateMetadata={handleUpdateMetadata}
/>
```

## Canvas Integration

The modal is transparent in the center to show the existing Three.js canvas underneath. Make sure:

1. **Canvas is in background**: The modal renders over the canvas
2. **Camera controls work**: OrbitControls should still function during preview
3. **Loading states**: Show spinner while parsing/rendering shapes
4. **Clean up**: Clear canvas when modal closes if needed

```tsx
// In your shape page component
useEffect(() => {
  if (!browserOpen) {
    // Optionally clear the preview when modal closes
    clearCanvas();
  }
}, [browserOpen]);
```

## Mobile Optimization

The modal automatically adjusts for mobile:
- Stacked layout on small screens
- Larger touch targets
- Swipe gestures for navigation (if implemented)
- Full-screen on mobile devices

## Future Enhancements

- 🔄 Swipe gestures (using `react-swipeable` or similar)
- 🔢 Jump to index (click pagination to type number)
- ⭐ Favorites system
- 🔍 Search/filter within browser
- 📊 Sort options (name, date, size, pieces)
- 🎨 Thumbnail mode toggle (grid view)
- ⚡ Prefetch next/prev shapes for instant navigation
- 💾 Cache rendered thumbnails in IndexedDB
