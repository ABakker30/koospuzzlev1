import React, { useState } from 'react';
import { runPublicationsProbes } from '../ai/probes/runPublicationsProbes';
import { exportProbeRunJson, type ProbeRun } from '../ai/probes/probeRecorder';

/**
 * Dev tool for running and downloading publication probe results
 * Add to any page during development: <DevProbeRunner />
 */
export const DevProbeRunner: React.FC = () => {
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [lastRun, setLastRun] = useState<ProbeRun | null>(null);

  const handleRunProbes = async () => {
    setIsRunning(true);
    setProgress({ current: 0, total: 0 });
    
    try {
      const run = await runPublicationsProbes(
        'v1-dev',
        (current, total) => setProgress({ current, total })
      );
      
      setLastRun(run);
      console.log('[DevProbeRunner] Probe run complete:', run);
      
      // Auto-download results
      exportProbeRunJson(run);
      
    } catch (error) {
      console.error('[DevProbeRunner] Probe run failed:', error);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        padding: '16px',
        background: '#1a1a1a',
        color: '#fff',
        borderRadius: '8px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        zIndex: 9999,
        minWidth: '280px',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontSize: '14px',
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: '12px', color: '#3b82f6' }}>
        🧪 Publications Probe Runner
      </div>
      
      <button
        onClick={handleRunProbes}
        disabled={isRunning}
        style={{
          width: '100%',
          padding: '10px',
          background: isRunning ? '#4b5563' : '#3b82f6',
          color: '#fff',
          border: 'none',
          borderRadius: '6px',
          cursor: isRunning ? 'not-allowed' : 'pointer',
          fontWeight: 500,
          fontSize: '14px',
          marginBottom: '8px',
        }}
      >
        {isRunning ? 'Running...' : 'Run All Probes'}
      </button>
      
      {isRunning && (
        <div style={{ fontSize: '12px', color: '#9ca3af', textAlign: 'center' }}>
          {progress.current} / {progress.total}
        </div>
      )}
      
      {lastRun && !isRunning && (
        <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #374151' }}>
          <div style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '8px' }}>
            ✅ Complete: {lastRun.items.length} probes
          </div>
          
          <button
            onClick={() => exportProbeRunJson(lastRun)}
            style={{
              width: '100%',
              padding: '8px',
              background: '#059669',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px',
            }}
          >
            💾 Download Results
          </button>
          
          <div style={{ marginTop: '8px', fontSize: '11px', color: '#6b7280' }}>
            Run ID: {lastRun.run_id.split('-').pop()?.slice(0, 8)}
          </div>
        </div>
      )}
      
      <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #374151', fontSize: '11px', color: '#6b7280' }}>
        Tests: Publications knowledge conditional loading
      </div>
    </div>
  );
};
