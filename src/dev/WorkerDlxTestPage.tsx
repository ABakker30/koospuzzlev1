// src/dev/WorkerDlxTestPage.tsx
// Test harness for DLX Web Worker
// Verifies timeout, cancellation, and determinism

import { useState } from 'react';
import { dlxWorkerCheck, dlxWorkerDispose } from '../engines/dlxWorkerClient';
import type { DLXCheckInput } from '../engines/dlxSolver';
import type { IJK } from '../types/shape';

export default function WorkerDlxTestPage() {
  const [results, setResults] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  const addResult = (msg: string) => {
    setResults(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  const clearResults = () => {
    setResults([]);
  };

  // Create a simple test input (small puzzle state)
  const createTestInput = (): DLXCheckInput => {
    const containerCells: IJK[] = [];
    // 5x5x5 cube = 125 cells
    for (let i = 0; i < 5; i++) {
      for (let j = 0; j < 5; j++) {
        for (let k = 0; k < 5; k++) {
          containerCells.push({ i, j, k });
        }
      }
    }

    return {
      containerCells,
      emptyCells: containerCells.slice(0, 100), // 100 empty
      placedPieces: [],
      remainingPieces: ['A', 'B', 'C', 'D', 'E'] as any, // Type workaround for test
      mode: 'oneOfEach',
    };
  };

  const runSingleCheck = async () => {
    setIsRunning(true);
    addResult('Starting single check...');
    addResult('⏳ Check console (F12) for worker messages...');
    
    try {
      const input = createTestInput();
      const startTime = performance.now();
      
      addResult('📤 Sending request to worker...');
      const result = await dlxWorkerCheck(input, {
        timeoutMs: 5000,
        emptyThreshold: 90,
      });
      
      const elapsed = performance.now() - startTime;
      
      addResult(`✅ Result: ${result.state} in ${elapsed.toFixed(0)}ms`);
      addResult(`   Empty: ${result.emptyCellCount}, Solutions: ${result.solutionCount ?? '—'}`);
      addResult(`   Search space: ${result.estimatedSearchSpace ?? '—'}, Valid moves: ${result.validNextMoveCount ?? '—'}`);
      addResult(`   Timed out: ${result.timedOut}, Reason: ${result.reason}`);
    } catch (error) {
      addResult(`❌ Error: ${error}`);
      addResult(`   Stack: ${(error as Error).stack?.substring(0, 200)}`);
      console.error('Worker test error:', error);
    } finally {
      setIsRunning(false);
    }
  };

  const runDeterminismTest = async () => {
    setIsRunning(true);
    addResult('Starting determinism test (10 runs)...');
    
    try {
      const input = createTestInput();
      const results: string[] = [];
      
      for (let i = 0; i < 10; i++) {
        const result = await dlxWorkerCheck(input, {
          timeoutMs: 5000,
          emptyThreshold: 90,
        });
        
        const signature = `${result.state}|${result.emptyCellCount}|${result.solutionCount}|${result.validNextMoveCount}`;
        results.push(signature);
        addResult(`  Run ${i + 1}: ${signature}`);
      }
      
      // Check if all results are identical
      const allSame = results.every(r => r === results[0]);
      if (allSame) {
        addResult(`✅ DETERMINISTIC: All 10 runs produced identical results`);
      } else {
        addResult(`❌ NON-DETERMINISTIC: Results varied across runs`);
        addResult(`   Unique results: ${new Set(results).size}`);
      }
    } catch (error) {
      addResult(`❌ Error: ${error}`);
    } finally {
      setIsRunning(false);
    }
  };

  const runSpamTest = async () => {
    setIsRunning(true);
    addResult('Starting spam test (20 rapid requests)...');
    addResult('⏳ First 19 requests should be cancelled, only #20 completes...');
    
    try {
      const input = createTestInput();
      const promises: Promise<any>[] = [];
      let completedCount = 0;
      let cancelledCount = 0;
      
      // Fire 20 requests rapidly
      for (let i = 0; i < 20; i++) {
        const p = dlxWorkerCheck(input, {
          timeoutMs: 5000,
          emptyThreshold: 90,
        }).then(result => {
          completedCount++;
          addResult(`  ✅ Request ${i + 1} completed: ${result.state}`);
          return result;
        }).catch(err => {
          if (err.message === 'Request cancelled') {
            cancelledCount++;
            // Don't log every cancellation - too noisy
          } else {
            addResult(`  ❌ Request ${i + 1} failed: ${err.message}`);
          }
        });
        promises.push(p);
      }
      
      // Wait for all
      await Promise.allSettled(promises);
      addResult(`✅ Spam test complete`);
      addResult(`   Completed: ${completedCount}, Cancelled: ${cancelledCount}`);
      addResult(`   Expected: 1 completion, 19 cancellations`);
      
      if (completedCount === 1 && cancelledCount === 19) {
        addResult(`🎉 PERFECT: Only latest request completed, all others cancelled`);
      } else {
        addResult(`⚠️ Unexpected counts - check cancellation logic`);
      }
    } catch (error) {
      addResult(`❌ Error: ${error}`);
    } finally {
      setIsRunning(false);
    }
  };

  const runTimeoutTest = async () => {
    setIsRunning(true);
    addResult('Starting timeout test (100ms timeout on complex puzzle)...');
    
    try {
      const input = createTestInput();
      // Modify to make it complex
      input.emptyCells = input.containerCells.slice(0, 80); // More empty cells
      
      const startTime = performance.now();
      const result = await dlxWorkerCheck(input, {
        timeoutMs: 100, // Very short timeout
        emptyThreshold: 50,
      });
      const elapsed = performance.now() - startTime;
      
      if (result.timedOut) {
        addResult(`✅ Timeout handled correctly in ${elapsed.toFixed(0)}ms`);
        addResult(`   State: ${result.state}, Reason: ${result.reason}`);
      } else {
        addResult(`⚠️ Completed before timeout: ${result.state}`);
      }
    } catch (error) {
      addResult(`❌ Error: ${error}`);
    } finally {
      setIsRunning(false);
    }
  };

  const handleDispose = () => {
    dlxWorkerDispose();
    addResult('🗑️ Worker disposed');
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <h1>DLX Web Worker Test Harness</h1>
      
      <div style={{ marginBottom: '2rem', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        <button
          onClick={runSingleCheck}
          disabled={isRunning}
          style={{
            padding: '0.5rem 1rem',
            fontSize: '14px',
            cursor: isRunning ? 'not-allowed' : 'pointer',
          }}
        >
          Run Single Check
        </button>
        
        <button
          onClick={runDeterminismTest}
          disabled={isRunning}
          style={{
            padding: '0.5rem 1rem',
            fontSize: '14px',
            cursor: isRunning ? 'not-allowed' : 'pointer',
          }}
        >
          Run Determinism Test (10x)
        </button>
        
        <button
          onClick={runSpamTest}
          disabled={isRunning}
          style={{
            padding: '0.5rem 1rem',
            fontSize: '14px',
            cursor: isRunning ? 'not-allowed' : 'pointer',
          }}
        >
          Run Spam Test (20x)
        </button>
        
        <button
          onClick={runTimeoutTest}
          disabled={isRunning}
          style={{
            padding: '0.5rem 1rem',
            fontSize: '14px',
            cursor: isRunning ? 'not-allowed' : 'pointer',
          }}
        >
          Run Timeout Test
        </button>
        
        <button
          onClick={clearResults}
          style={{
            padding: '0.5rem 1rem',
            fontSize: '14px',
            cursor: 'pointer',
          }}
        >
          Clear Results
        </button>
        
        <button
          onClick={handleDispose}
          style={{
            padding: '0.5rem 1rem',
            fontSize: '14px',
            cursor: 'pointer',
            background: '#dc2626',
            color: 'white',
            border: 'none',
          }}
        >
          Dispose Worker
        </button>
      </div>

      {isRunning && (
        <div style={{
          padding: '1rem',
          background: '#fef3c7',
          border: '2px solid #fbbf24',
          borderRadius: '8px',
          marginBottom: '1rem',
        }}>
          ⏳ Running test...
        </div>
      )}

      <div style={{
        background: '#1e293b',
        color: '#e2e8f0',
        padding: '1rem',
        borderRadius: '8px',
        fontFamily: 'monospace',
        fontSize: '13px',
        maxHeight: '600px',
        overflowY: 'auto',
      }}>
        {results.length === 0 ? (
          <div style={{ color: '#94a3b8' }}>No results yet. Click a button to run a test.</div>
        ) : (
          results.map((result, idx) => (
            <div key={idx} style={{ marginBottom: '4px' }}>
              {result}
            </div>
          ))
        )}
      </div>

      <div style={{ marginTop: '2rem', fontSize: '14px', color: '#64748b' }}>
        <h3>Test Descriptions:</h3>
        <ul>
          <li><strong>Single Check:</strong> Runs one worker check and displays full result</li>
          <li><strong>Determinism Test:</strong> Runs same input 10 times, verifies identical results</li>
          <li><strong>Spam Test:</strong> Fires 20 rapid requests, verifies cancellation works</li>
          <li><strong>Timeout Test:</strong> Uses very short timeout (100ms) to verify timeout handling</li>
          <li><strong>Dispose Worker:</strong> Terminates worker and cleans up pending requests</li>
        </ul>
      </div>
    </div>
  );
}
