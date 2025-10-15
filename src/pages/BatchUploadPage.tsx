// Batch Upload Admin Page - Upload shapes and solutions to Supabase
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { uploadShape } from '../api/shapes';
import { uploadSolution } from '../api/solutions';
import { supabase } from '../lib/supabase';
import AuthPanel from '../components/AuthPanel';

type FileStatus = 'pending' | 'uploading' | 'success' | 'error';

interface FileItem {
  file: File;
  name: string;
  type: 'shape' | 'solution';
  status: FileStatus;
  error?: string;
  id?: string;
}

export default function BatchUploadPage() {
  const navigate = useNavigate();
  const [files, setFiles] = useState<FileItem[]>([]);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // Check auth on mount
  useState(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUserEmail(user?.email || null);
    };
    checkUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUserEmail(session?.user?.email || null);
    });

    return () => subscription.unsubscribe();
  });

  const handleFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    const items: FileItem[] = selectedFiles.map(file => {
      // Determine type from filename or path
      const isSolution = file.name.includes('.result') || file.name.includes('_dlx_') || file.webkitRelativePath.includes('Solutions');
      
      return {
        file,
        name: file.name,
        type: isSolution ? 'solution' : 'shape',
        status: 'pending' as FileStatus
      };
    });
    setFiles(items);
  };

  const uploadAll = async () => {
    if (!userEmail) {
      alert('Please sign in first');
      return;
    }

    setUploading(true);
    
    for (let i = 0; i < files.length; i++) {
      const item = files[i];
      
      // Update status to uploading
      setFiles(prev => prev.map((f, idx) => 
        idx === i ? { ...f, status: 'uploading' as FileStatus } : f
      ));

      try {
        // Read and parse file
        const text = await item.file.text();
        const data = JSON.parse(text);

        if (item.type === 'shape') {
          // Upload shape
          const shapeName = item.name.replace('.fcc.json', '').replace('.json', '');
          const result = await uploadShape(item.file, shapeName, {
            cellCount: data.cells?.length || 0,
            lattice: 'fcc'
          });
          
          // Update status to success
          setFiles(prev => prev.map((f, idx) => 
            idx === i ? { ...f, status: 'success' as FileStatus, id: result.id } : f
          ));
        } else {
          // Upload solution
          const solutionName = item.name.replace('.json', '');
          const shapeId = null; // No shape linkage for now
          
          console.log(`Uploading solution ${i+1}/${files.length}: ${solutionName}`);
          
          const result = await uploadSolution(shapeId, item.file, solutionName, {
            pieceCount: data.placements?.length || data.pieces?.length || 0,
            cellCount: data.container?.cells?.length || 0
          });
          
          console.log(`✅ Successfully uploaded: ${solutionName}`, result);
          
          // Update status to success
          setFiles(prev => prev.map((f, idx) => 
            idx === i ? { ...f, status: 'success' as FileStatus, id: result.id } : f
          ));
        }
      } catch (error: any) {
        console.error(`Failed to upload ${item.name}:`, error);
        setFiles(prev => prev.map((f, idx) => 
          idx === i ? { ...f, status: 'error' as FileStatus, error: error.message } : f
        ));
      }
    }
    
    setUploading(false);
    alert('Upload complete!');
  };

  const clearAll = () => {
    setFiles([]);
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8f9fa', padding: '2rem' }}>
      {/* Header */}
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <h1 style={{ fontSize: '2rem', fontWeight: 'bold' }}>📦 Batch Upload Admin</h1>
          <button className="btn" onClick={() => navigate('/')} style={{ height: '2.5rem' }}>
            ⌂ Home
          </button>
        </div>

        {/* Auth Panel */}
        {!userEmail && (
          <div style={{ backgroundColor: '#fff', padding: '1.5rem', borderRadius: '8px', marginBottom: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <h2 style={{ marginBottom: '1rem' }}>Sign In Required</h2>
            <AuthPanel />
          </div>
        )}

        {userEmail && (
          <>
            {/* File Selection */}
            <div style={{ backgroundColor: '#fff', padding: '1.5rem', borderRadius: '8px', marginBottom: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
              <h2 style={{ marginBottom: '1rem' }}>Select Files</h2>
              <p style={{ color: '#666', marginBottom: '1rem' }}>
                Select multiple shape (.fcc.json) and solution (.json) files from your local drive.
              </p>
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                <label className="btn primary" style={{ cursor: 'pointer' }}>
                  📁 Choose Files
                  <input
                    type="file"
                    multiple
                    accept=".json"
                    onChange={handleFilesSelected}
                    style={{ display: 'none' }}
                  />
                </label>
                <span style={{ color: '#666' }}>{files.length} files selected</span>
                {files.length > 0 && (
                  <button className="btn" onClick={clearAll} style={{ marginLeft: 'auto' }}>
                    Clear All
                  </button>
                )}
              </div>
            </div>

            {/* File List */}
            {files.length > 0 && (
              <div style={{ backgroundColor: '#fff', padding: '1.5rem', borderRadius: '8px', marginBottom: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <h2>Files to Upload</h2>
                  <button 
                    className="btn primary" 
                    onClick={uploadAll} 
                    disabled={uploading}
                    style={{ minWidth: '120px' }}
                  >
                    {uploading ? '⏳ Uploading...' : '☁️ Upload All'}
                  </button>
                </div>

                <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid #eee' }}>
                        <th style={{ textAlign: 'left', padding: '8px' }}>Status</th>
                        <th style={{ textAlign: 'left', padding: '8px' }}>Name</th>
                        <th style={{ textAlign: 'left', padding: '8px' }}>Type</th>
                        <th style={{ textAlign: 'left', padding: '8px' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {files.map((item, index) => (
                        <tr key={index} style={{ borderBottom: '1px solid #f0f0f0' }}>
                          <td style={{ padding: '8px' }}>
                            {item.status === 'pending' && '⏸️'}
                            {item.status === 'uploading' && '⏳'}
                            {item.status === 'success' && '✅'}
                            {item.status === 'error' && '❌'}
                          </td>
                          <td style={{ padding: '8px', fontSize: '14px' }}>
                            {item.name}
                            {item.error && <div style={{ fontSize: '12px', color: '#c00' }}>{item.error}</div>}
                            {item.id && <div style={{ fontSize: '12px', color: '#666' }}>ID: {item.id}</div>}
                          </td>
                          <td style={{ padding: '8px' }}>
                            <span style={{ 
                              padding: '4px 8px', 
                              borderRadius: '4px', 
                              fontSize: '12px',
                              backgroundColor: item.type === 'shape' ? '#e0f2fe' : '#fef3c7',
                              color: item.type === 'shape' ? '#075985' : '#92400e'
                            }}>
                              {item.type}
                            </span>
                          </td>
                          <td style={{ padding: '8px' }}>
                            {item.status === 'pending' && (
                              <button 
                                className="btn" 
                                onClick={() => removeFile(index)}
                                style={{ padding: '4px 8px', fontSize: '12px' }}
                              >
                                Remove
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Summary */}
                <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: '#f8f9fa', borderRadius: '6px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
                    <div>
                      <div style={{ fontSize: '12px', color: '#666' }}>Total</div>
                      <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{files.length}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '12px', color: '#666' }}>Pending</div>
                      <div style={{ fontSize: '24px', fontWeight: 'bold' }}>
                        {files.filter(f => f.status === 'pending').length}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '12px', color: '#22c55e' }}>Success</div>
                      <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#22c55e' }}>
                        {files.filter(f => f.status === 'success').length}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '12px', color: '#ef4444' }}>Errors</div>
                      <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#ef4444' }}>
                        {files.filter(f => f.status === 'error').length}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
