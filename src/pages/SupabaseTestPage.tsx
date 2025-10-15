// Quick smoke test page for Supabase integration
// Access at: http://localhost:5173/supabase-test

import { useState } from 'react';
import AuthPanel from '../components/AuthPanel';
import { uploadShape, listShapes, getShapeSignedUrl } from '../api/shapes';
import { uploadSolution, listSolutions, getSolutionSignedUrl } from '../api/solutions';

export default function SupabaseTestPage() {
  const [status, setStatus] = useState('');
  const [shapes, setShapes] = useState<any[]>([]);
  const [solutions, setSolutions] = useState<any[]>([]);

  const handleShapeUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setStatus('📤 Uploading shape...');
      const shape = await uploadShape(file, file.name, { test: true });
      setStatus(`✅ Shape uploaded! ID: ${shape.id}`);
      
      // Get signed URL
      const url = await getShapeSignedUrl(shape.file_url);
      console.log('👍 Signed URL:', url);
      setStatus(prev => prev + '\n📋 Signed URL logged to console');
      
      // Refresh list
      await loadShapes();
    } catch (error: any) {
      setStatus(`❌ Error: ${error.message}`);
      console.error('Upload error:', error);
    }
  };

  const loadShapes = async () => {
    try {
      setStatus('📥 Loading shapes...');
      const list = await listShapes();
      setShapes(list);
      setStatus(`✅ Loaded ${list.length} shapes`);
    } catch (error: any) {
      setStatus(`❌ Error loading shapes: ${error.message}`);
    }
  };

  const handleSolutionUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (shapes.length === 0) {
      alert('Upload a shape first!');
      return;
    }

    try {
      setStatus('📤 Uploading solution...');
      const solution = await uploadSolution(shapes[0].id, file, file.name, { test: true });
      setStatus(`✅ Solution uploaded! ID: ${solution.id}`);
      
      // Get signed URL
      const url = await getSolutionSignedUrl(solution.file_url);
      console.log('👍 Solution URL:', url);
      setStatus(prev => prev + '\n📋 Signed URL logged to console');
      
      // Refresh list
      await loadSolutions();
    } catch (error: any) {
      setStatus(`❌ Error: ${error.message}`);
      console.error('Upload error:', error);
    }
  };

  const loadSolutions = async () => {
    try {
      setStatus('📥 Loading solutions...');
      const list = await listSolutions();
      setSolutions(list);
      setStatus(`✅ Loaded ${list.length} solutions`);
    } catch (error: any) {
      setStatus(`❌ Error loading solutions: ${error.message}`);
    }
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8f9fa' }}>
      <AuthPanel />
      
      <div style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem' }}>
        <h1 style={{ marginBottom: '1rem' }}>🧪 Supabase Smoke Test</h1>
        <p style={{ color: '#666', marginBottom: '2rem' }}>
          Test authentication and file uploads. Check browser console for signed URLs.
        </p>

        <div style={{ 
          backgroundColor: '#fff', 
          padding: '1.5rem', 
          borderRadius: '8px',
          marginBottom: '1rem',
          border: '1px solid #dee2e6'
        }}>
          <h2 style={{ fontSize: '1.2rem', marginBottom: '1rem' }}>📦 Shapes</h2>
          
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
              Upload Shape File:
            </label>
            <input 
              type="file" 
              onChange={handleShapeUpload}
              style={{ padding: '0.5rem' }}
            />
          </div>

          <button 
            onClick={loadShapes}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: '#007bff',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              marginBottom: '1rem'
            }}
          >
            🔄 Load My Shapes
          </button>

          {shapes.length > 0 && (
            <div>
              <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>Your Shapes:</h3>
              <ul style={{ listStyle: 'none', padding: 0 }}>
                {shapes.map(shape => (
                  <li key={shape.id} style={{ 
                    padding: '0.5rem',
                    backgroundColor: '#f8f9fa',
                    marginBottom: '0.5rem',
                    borderRadius: '4px',
                    fontSize: '0.9rem'
                  }}>
                    📄 {shape.name} 
                    <span style={{ color: '#666', marginLeft: '1rem' }}>
                      ({shape.size_bytes ? `${Math.round(shape.size_bytes / 1024)}KB` : '?'})
                    </span>
                    <button
                      onClick={async () => {
                        const url = await getShapeSignedUrl(shape.file_url);
                        window.open(url, '_blank');
                      }}
                      style={{
                        marginLeft: '1rem',
                        padding: '0.25rem 0.5rem',
                        fontSize: '0.8rem',
                        backgroundColor: '#28a745',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '3px',
                        cursor: 'pointer'
                      }}
                    >
                      Download
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div style={{ 
          backgroundColor: '#fff', 
          padding: '1.5rem', 
          borderRadius: '8px',
          marginBottom: '1rem',
          border: '1px solid #dee2e6'
        }}>
          <h2 style={{ fontSize: '1.2rem', marginBottom: '1rem' }}>🎯 Solutions</h2>
          
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
              Upload Solution File:
            </label>
            <input 
              type="file" 
              onChange={handleSolutionUpload}
              style={{ padding: '0.5rem' }}
              disabled={shapes.length === 0}
            />
            {shapes.length === 0 && (
              <p style={{ fontSize: '0.8rem', color: '#dc3545', marginTop: '0.25rem' }}>
                Upload a shape first to link solutions
              </p>
            )}
          </div>

          <button 
            onClick={loadSolutions}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: '#007bff',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              marginBottom: '1rem'
            }}
          >
            🔄 Load My Solutions
          </button>

          {solutions.length > 0 && (
            <div>
              <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>Your Solutions:</h3>
              <ul style={{ listStyle: 'none', padding: 0 }}>
                {solutions.map(sol => (
                  <li key={sol.id} style={{ 
                    padding: '0.5rem',
                    backgroundColor: '#f8f9fa',
                    marginBottom: '0.5rem',
                    borderRadius: '4px',
                    fontSize: '0.9rem'
                  }}>
                    🎯 {sol.name || 'Unnamed'} 
                    <span style={{ color: '#666', marginLeft: '1rem' }}>
                      ({sol.size_bytes ? `${Math.round(sol.size_bytes / 1024)}KB` : '?'})
                    </span>
                    <button
                      onClick={async () => {
                        const url = await getSolutionSignedUrl(sol.file_url);
                        window.open(url, '_blank');
                      }}
                      style={{
                        marginLeft: '1rem',
                        padding: '0.25rem 0.5rem',
                        fontSize: '0.8rem',
                        backgroundColor: '#28a745',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '3px',
                        cursor: 'pointer'
                      }}
                    >
                      Download
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {status && (
          <div style={{
            padding: '1rem',
            backgroundColor: status.includes('❌') ? '#f8d7da' : '#d4edda',
            color: status.includes('❌') ? '#721c24' : '#155724',
            borderRadius: '4px',
            whiteSpace: 'pre-line',
            fontFamily: 'monospace',
            fontSize: '0.9rem'
          }}>
            {status}
          </div>
        )}

        <div style={{ 
          marginTop: '2rem', 
          padding: '1rem', 
          backgroundColor: '#fff3cd',
          borderRadius: '4px',
          border: '1px solid #ffc107'
        }}>
          <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>📋 Checklist</h3>
          <ul style={{ fontSize: '0.9rem', lineHeight: '1.6' }}>
            <li>✅ Sign in with email magic link</li>
            <li>✅ Upload a file → check console for signed URL</li>
            <li>✅ Click "Download" → file should download</li>
            <li>✅ Check Supabase Storage UI → file under your user ID</li>
            <li>✅ Check Supabase Table Editor → row in shapes/solutions</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
