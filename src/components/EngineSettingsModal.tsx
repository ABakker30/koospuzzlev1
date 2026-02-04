// src/components/EngineSettingsModal.tsx
import React, { useState, useEffect } from "react";
import type { Engine2Settings, PieceDB } from "../engines/engine2";
import { InfoModal } from "./InfoModal";
import { useDraggable } from "../hooks/useDraggable";
import { runBenchmark, type BenchmarkResult, type BenchmarkInput } from "../utils/solverBenchmark";
import { detectGPUCapability, type GPUCapability } from "../engines/engineGPU/gpuDetect";

type SolverMode = "exhaustive" | "balanced" | "fast";

export type GPUSettings = {
  enabled: boolean;
  prefixDepth: number;
  threadBudget: number;
};

type Props = {
  open: boolean;
  onClose: () => void;
  engineName: string;
  currentSettings: Engine2Settings;
  onSave: (settings: Engine2Settings, gpuSettings?: GPUSettings) => void;
  puzzleId?: string;
  puzzleGeometry?: [number, number, number][];
  pieceDB?: PieceDB;
  puzzleStats?: {
    puzzleName: string;
    containerCells: number;
    totalSpheres: number;
    pieceTypeCount: number;
  };
  initialGpuSettings?: GPUSettings;
};

export const EngineSettingsModal: React.FC<Props> = ({ 
  open, 
  onClose, 
  engineName, 
  currentSettings,
  onSave,
  puzzleId,
  puzzleGeometry,
  pieceDB,
  puzzleStats,
  initialGpuSettings
}) => {
  const draggable = useDraggable();
  
  // Mode selection state
  const [mode, setMode] = useState<SolverMode | null>(null);
  
  const [timeoutSec, setTimeoutSec] = useState<number | string>((currentSettings.timeoutMs ?? 0) / 1000);
  
  // Engine 2 specific settings
  const [randomizeTies, setRandomizeTies] = useState(currentSettings.randomizeTies ?? true);
  const [seed, setSeed] = useState<number | string>(currentSettings.seed ?? 12345);
  
  // Shuffle strategy settings
  const [shuffleStrategy, setShuffleStrategy] = useState<"none" | "initial" | "periodicRestart" | "periodicRestartTime" | "adaptive">(currentSettings.shuffleStrategy ?? "none");
  const [restartInterval, setRestartInterval] = useState<number | string>(currentSettings.restartInterval ?? 50000);
  const [restartIntervalSeconds, setRestartIntervalSeconds] = useState<number | string>(currentSettings.restartIntervalSeconds ?? 5);
  const [shuffleTriggerDepth, setShuffleTriggerDepth] = useState<number | string>(currentSettings.shuffleTriggerDepth ?? 8);
  const [maxSuffixShuffles, setMaxSuffixShuffles] = useState<number | string>(currentSettings.maxSuffixShuffles ?? 5);

  // Exhaustive-only: optional periodic restart
  const [exhaustiveRestartEnabled, setExhaustiveRestartEnabled] = useState(false);
  
  // Info modal state
  const [showInfo, setShowInfo] = useState(false);
  
  // Tail solver settings (DLX only)
  const [tailEnable, setTailEnable] = useState(currentSettings.tailSwitch?.enable ?? true);
  const [dlxThreshold, setDlxThreshold] = useState<number | string>(currentSettings.tailSwitch?.dlxThreshold ?? 100);
  const [dlxTimeoutSec, setDlxTimeoutSec] = useState<number | string>((currentSettings.tailSwitch?.dlxTimeoutMs ?? 30000) / 1000);

  // Pruning settings
  const [connectivityPruning, setConnectivityPruning] = useState(currentSettings.pruning?.connectivity ?? false);

  // Parallel workers settings
  const [parallelEnabled, setParallelEnabled] = useState(false);
  const [workerCount, setWorkerCount] = useState(navigator.hardwareConcurrency || 4);

  // Max solutions setting
  const [maxSolutions, setMaxSolutions] = useState<number | string>(currentSettings.maxSolutions ?? 1);

  // Gravity constraints setting
  const [gravityEnabled, setGravityEnabled] = useState(false);

  // GPU solver settings
  const [gpuEnabled, setGpuEnabled] = useState(false);
  const [gpuCapability, setGpuCapability] = useState<GPUCapability | null>(null);
  const [gpuPrefixDepth, setGpuPrefixDepth] = useState<number | string>(4); // Lower default for reasonable GPU memory
  const [gpuThreadBudget, setGpuThreadBudget] = useState<number | string>(1000); // Lower default for responsive GPU dispatches

  // Benchmark state
  const [benchmarkRunning, setBenchmarkRunning] = useState(false);
  const [benchmarkResult, setBenchmarkResult] = useState<BenchmarkResult | null>(null);
  const [benchmarkTrials, setBenchmarkTrials] = useState(3);

  // Sync with props when modal opens
  useEffect(() => {
    if (open) {
      // Reset mode selection on every open (fresh start)
      setMode(null);
      
      setTimeoutSec((currentSettings.timeoutMs ?? 0) / 1000);
      
      // Engine 2 specific
      setRandomizeTies(currentSettings.randomizeTies ?? true);
      
      // Always generate fresh time-based seed when modal opens
      const now = new Date();
      const timeSeed = now.getHours() * 10000 + now.getMinutes() * 100 + now.getSeconds();
      setSeed(timeSeed);
      
      // Shuffle strategy
      setShuffleStrategy(currentSettings.shuffleStrategy ?? "none");
      setRestartInterval(currentSettings.restartInterval ?? 50000);
      setRestartIntervalSeconds(currentSettings.restartIntervalSeconds ?? 5);
      setShuffleTriggerDepth(currentSettings.shuffleTriggerDepth ?? 8);
      setMaxSuffixShuffles(currentSettings.maxSuffixShuffles ?? 5);

      // Exhaustive-only: enable restarts only if current settings are already time-based restarts
      setExhaustiveRestartEnabled(currentSettings.shuffleStrategy === 'periodicRestartTime');
      
      // Tail solver (DLX only)
      setTailEnable(currentSettings.tailSwitch?.enable ?? true);
      setDlxThreshold(currentSettings.tailSwitch?.dlxThreshold ?? 100);
      setDlxTimeoutSec((currentSettings.tailSwitch?.dlxTimeoutMs ?? 30000) / 1000);

      // Pruning
      setConnectivityPruning(currentSettings.pruning?.connectivity ?? false);

      // Parallel workers
      setParallelEnabled(currentSettings.parallel?.enable ?? false);
      setWorkerCount(currentSettings.parallel?.workerCount ?? (navigator.hardwareConcurrency || 4));

      // Max solutions
      setMaxSolutions(currentSettings.maxSolutions ?? 1);

      // Gravity constraints
      setGravityEnabled(currentSettings.gravityConstraints?.enable ?? false);

      // GPU settings - detect capability and load initial settings
      detectGPUCapability().then(cap => {
        setGpuCapability(cap);
        if (!cap.supported) {
          setGpuEnabled(false);
        } else if (initialGpuSettings) {
          setGpuEnabled(initialGpuSettings.enabled);
          setGpuPrefixDepth(initialGpuSettings.prefixDepth);
          setGpuThreadBudget(initialGpuSettings.threadBudget);
        }
      });
    }
  }, [open, currentSettings, initialGpuSettings]);

  if (!open) return null;

  // Helper: Determine which sections to show based on mode
  const shouldShow = (section: "timeout" | "tail" | "restart" | "randomness"): boolean => {
    if (!mode) return false;
    if (mode === "exhaustive") {
      // Exhaustive: Tail + timeout + optional restarts
      return section === "timeout" || section === "tail" || section === "restart";
    }
    if (mode === "balanced") {
      // Balanced: All ingredients visible
      return true;
    }
    if (mode === "fast") {
      // Fast: Tail + restart + randomness (aggressive exploration)
      return section === "tail" || section === "restart" || section === "randomness";
    }
    return false;
  };

  // Helper: Derive hidden Engine2 settings from mode + user ingredients
  const deriveSettingsFromMode = (userIngredients: {
    timeout: number;
    tailEnable: boolean;
    dlxThreshold: number;
    dlxTimeoutMs: number;
    randomizeTies: boolean;
    seed: number;
    shuffleStrategy: string;
    restartInterval: number;
    restartIntervalSeconds: number;
  }): Partial<Engine2Settings> => {
    if (!mode) return {};

    const maxSolutionsNum = typeof maxSolutions === 'string' ? parseInt(maxSolutions) || 1 : maxSolutions;
    const commonSettings = {
      maxSolutions: maxSolutionsNum,
      pauseOnSolution: true,
      statusIntervalMs: 1000,
      saveSolutions: false,
      moveOrdering: "mostConstrainedCell" as const,
      pruning: {
        connectivity: connectivityPruning,
        multipleOf4: true,
        colorResidue: false,
        neighborTouch: false,
      },
      visualRevealDelayMs: 150,
      parallel: {
        enable: parallelEnabled,
        workerCount: workerCount,
      },
      gravityConstraints: {
        enable: gravityEnabled,
      },
    };

    if (mode === "exhaustive") {
      // Exhaustive: Time-seeded randomized start, deterministic after start
      const restartSec = Math.max(0.1, userIngredients.restartIntervalSeconds);
      const shouldRestart = exhaustiveRestartEnabled && restartSec > 0;
      return {
        ...commonSettings,
        timeoutMs: userIngredients.timeout * 1000,
        randomizeTies: false, // Force off - keep deterministic after start
        shuffleStrategy: shouldRestart ? "periodicRestartTime" : "initial",
        seed: userIngredients.seed, // Time-based seed
        restartInterval: 0, // No restarts
        restartIntervalSeconds: shouldRestart ? restartSec : 0,
        maxRestarts: shouldRestart ? 999999 : 0,
        tt: { enable: false }, // Disable TT to avoid false UNSOLVABLE
        tailSwitch: {
          enable: userIngredients.tailEnable,
          dlxThreshold: userIngredients.dlxThreshold,
          dlxTimeoutMs: userIngredients.dlxTimeoutMs,
        },
      };
    }

    if (mode === "balanced") {
      // Balanced: User-controlled with smart defaults
      return {
        ...commonSettings,
        timeoutMs: userIngredients.timeout * 1000,
        randomizeTies: userIngredients.randomizeTies,
        shuffleStrategy: userIngredients.shuffleStrategy as any,
        seed: userIngredients.seed,
        restartInterval: Math.max(1000, userIngredients.restartInterval),
        restartIntervalSeconds: Math.max(0.1, userIngredients.restartIntervalSeconds),
        maxRestarts: 999999,
        tt: { enable: true },
        tailSwitch: {
          enable: userIngredients.tailEnable,
          dlxThreshold: userIngredients.dlxThreshold,
          dlxTimeoutMs: userIngredients.dlxTimeoutMs,
        },
      };
    }

    if (mode === "fast") {
      // Fast: Aggressive exploration
      return {
        ...commonSettings,
        timeoutMs: userIngredients.timeout * 1000,
        randomizeTies: true, // Force on
        shuffleStrategy: userIngredients.shuffleStrategy as any,
        seed: userIngredients.seed,
        restartInterval: Math.max(1000, userIngredients.restartInterval),
        restartIntervalSeconds: Math.max(0.1, userIngredients.restartIntervalSeconds),
        maxRestarts: 999999,
        tt: { enable: true },
        tailSwitch: {
          enable: userIngredients.tailEnable,
          dlxThreshold: userIngredients.dlxThreshold,
          dlxTimeoutMs: userIngredients.dlxTimeoutMs,
        },
      };
    }

    return commonSettings;
  };

  // Helper: Build dynamic info summary based on mode + ingredients + puzzle
  const buildInfoSummary = (): {
    headline: string;
    bullets: string[];
    puzzleLines: string[];
    wowLine: string;
  } => {
    const bullets: string[] = [];
    const puzzleLines: string[] = [];
    
    // Puzzle stats card
    if (puzzleStats) {
      const targetPieces = Math.floor(puzzleStats.containerCells / 4);
      puzzleLines.push(`**${puzzleStats.puzzleName}**`);
      puzzleLines.push(`Container: ${puzzleStats.containerCells} cells (${puzzleStats.totalSpheres} spheres)`);
      puzzleLines.push(`Available pieces: ${puzzleStats.pieceTypeCount} types`);
      puzzleLines.push(`Target: ~${targetPieces} pieces to fill container`);
    }
    
    // Mode description
    if (mode === "exhaustive") {
      bullets.push("**Mode:** Exhaustive — Randomized start each run (time-seeded), deterministic after start");
      bullets.push(`**Starting seed:** ${seed} (from current time)`);
      bullets.push("**Piece order:** Single shuffle at startup, then deterministic");
      bullets.push("**Tie-breaking:** Deterministic (no randomness after start)");
      bullets.push("**Transposition table:** Disabled (avoids false negatives)");
    } else if (mode === "balanced") {
      bullets.push("**Mode:** Balanced — Smart exploration with user control");
      bullets.push(`**Randomness:** ${randomizeTies ? `Enabled (seed: ${seed})` : 'Disabled'}`);
      bullets.push(`**Piece order:** ${shuffleStrategy === 'none' ? 'Alphabetical' : 
        shuffleStrategy === 'periodicRestartTime' ? `Restart every ${restartIntervalSeconds}s` :
        shuffleStrategy === 'periodicRestart' ? `Restart every ${restartInterval} nodes` :
        shuffleStrategy === 'adaptive' ? 'Adaptive suffix shuffle' : 'Initial shuffle'}`);
    } else if (mode === "fast") {
      bullets.push("**Mode:** Fast — Aggressive path exploration");
      bullets.push(`**Randomness:** Enabled (seed: ${seed})`);
      bullets.push(`**Piece order:** ${shuffleStrategy === 'periodicRestartTime' ? `Restart every ${restartIntervalSeconds}s` :
        shuffleStrategy === 'periodicRestart' ? `Restart every ${restartInterval} nodes` : 'Frequent restarts'}`);
    }
    
    // Tail solver (DLX only)
    if (tailEnable) {
      bullets.push(`**Tail solver:** DLX enabled (≤${dlxThreshold} cells, ${dlxTimeoutSec}s timeout)`);
    } else {
      bullets.push("**Tail solver:** Disabled");
    }
    
    // Timeout
    const timeoutVal = typeof timeoutSec === 'string' ? parseInt(timeoutSec) || 0 : timeoutSec;
    if (timeoutVal > 0) {
      const mins = Math.floor(timeoutVal / 60);
      bullets.push(`**Timeout:** ${mins > 0 ? `${mins}m` : `${timeoutVal}s`}`);
    } else {
      bullets.push("**Timeout:** None (unlimited)");
    }
    
    const headline = mode === "exhaustive" ? "Randomized start per run" :
                     mode === "balanced" ? "Smart exploration" :
                     "Aggressive search";
    
    const wowLine = puzzleStats 
      ? `Even conservative estimates for ${puzzleStats.containerCells}-cell puzzles create astronomically large search spaces. Your ${mode} mode guides the search toward promising structure.`
      : "Puzzle search spaces are vast. Your mode and strategy guide the solver toward solutions.";
    
    return { headline, bullets, puzzleLines, wowLine };
  };

  const handleSave = () => {
    if (!mode) return; // Should never happen (button is disabled)
    
    const timeout = typeof timeoutSec === 'string' ? parseInt(timeoutSec) || 0 : timeoutSec;
    const seedNum = typeof seed === 'string' ? parseInt(seed) || 12345 : seed;
    const dlxThresholdNum = typeof dlxThreshold === 'string' ? parseInt(dlxThreshold) || 100 : dlxThreshold;
    const dlxTimeoutMsNum = (typeof dlxTimeoutSec === 'string' ? parseInt(dlxTimeoutSec) || 30 : dlxTimeoutSec) * 1000;
    const restartIntervalNum = typeof restartInterval === 'string' ? parseInt(restartInterval) || 50000 : restartInterval;
    const restartIntervalSecondsNum = typeof restartIntervalSeconds === 'string' ? parseFloat(restartIntervalSeconds) || 5 : restartIntervalSeconds;
    
    // Derive settings from mode + user ingredients
    const derivedSettings = deriveSettingsFromMode({
      timeout,
      tailEnable,
      dlxThreshold: dlxThresholdNum,
      dlxTimeoutMs: dlxTimeoutMsNum,
      randomizeTies: mode === "exhaustive" ? false : randomizeTies, // Force off in exhaustive
      seed: seedNum,
      shuffleStrategy,
      restartInterval: restartIntervalNum,
      restartIntervalSeconds: restartIntervalSecondsNum,
    });
    
    const newSettings: Engine2Settings = {
      ...derivedSettings,
      pieces: currentSettings.pieces, // Keep existing piece config
      view: currentSettings.view, // Keep existing view config
      savePath: "", // Not used
      shuffleTriggerDepth: 8, // Default
      maxSuffixShuffles: 5, // Default
    } as Engine2Settings;
    
    // Build GPU settings
    const gpuPrefixDepthNum = typeof gpuPrefixDepth === 'string' ? parseInt(gpuPrefixDepth) || 6 : gpuPrefixDepth;
    const gpuThreadBudgetNum = typeof gpuThreadBudget === 'string' ? parseInt(gpuThreadBudget) || 100000 : gpuThreadBudget;
    
    const gpuSettingsToSave: GPUSettings = {
      enabled: gpuEnabled,
      prefixDepth: gpuPrefixDepthNum,
      threadBudget: gpuThreadBudgetNum,
    };
    
    console.log('💾 EngineSettingsModal saving GPU settings:', gpuSettingsToSave);
    onSave(newSettings, gpuSettingsToSave);
    onClose();
  };

  return (
    <>
      {/* Custom Scrollbar Styles */}
      <style>{`
        .engine-settings-modal-scrollable::-webkit-scrollbar {
          width: 12px;
        }
        .engine-settings-modal-scrollable::-webkit-scrollbar-track {
          background: rgba(59, 130, 246, 0.1);
          border-radius: 10px;
          margin: 20px 0;
        }
        .engine-settings-modal-scrollable::-webkit-scrollbar-thumb {
          background: linear-gradient(180deg, #f59e0b, #d97706);
          border-radius: 10px;
          border: 2px solid rgba(254, 243, 199, 0.5);
        }
        .engine-settings-modal-scrollable::-webkit-scrollbar-thumb:hover {
          background: linear-gradient(180deg, #d97706, #b45309);
        }
        .engine-settings-modal-scrollable::-webkit-scrollbar-thumb:active {
          background: #b45309;
        }
        .engine-settings-modal-scrollable {
          scrollbar-width: thin;
          scrollbar-color: #f59e0b rgba(59, 130, 246, 0.1);
        }
      `}</style>
      
      {/* Backdrop */}
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'transparent',
        backdropFilter: 'none',
        zIndex: 10000
      }} onClick={onClose} />
      
      {/* Modal - Centered and Draggable */}
      <div
        ref={draggable.ref}
        className="engine-settings-modal-scrollable"
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 50%, #fcd34d 100%)',
          borderRadius: '20px',
          padding: '0',
          maxWidth: '600px',
          width: '90%',
          maxHeight: '85vh',
          overflowY: 'auto',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
          border: '3px solid rgba(245,158,11,0.6)',
          zIndex: 10001,
          ...draggable.style
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header - Draggable */}
        <div
          style={{
            background: 'linear-gradient(135deg, #f59e0b, #d97706, #b45309)',
            padding: '1.25rem 1.5rem',
            borderRadius: '17px 17px 0 0',
            marginBottom: '20px',
            borderBottom: '3px solid rgba(255,255,255,0.3)',
            boxShadow: '0 4px 20px rgba(245,158,11,0.4)',
            position: 'relative',
            cursor: 'move'
          }}
        >
          <h2 style={{
            color: '#fff',
            fontSize: '20px',
            fontWeight: 700,
            margin: 0,
            textShadow: '0 2px 4px rgba(0,0,0,0.2)',
            paddingRight: '80px'
          }}>
            ⚙️ {engineName} Settings
          </h2>
          <div style={{ position: 'absolute', top: '12px', right: '12px', display: 'flex', gap: '8px' }}>
            <button
              onClick={() => setShowInfo(true)}
              title="Settings Help"
              style={{
                background: 'rgba(255,255,255,0.2)',
                border: 'none',
                borderRadius: '50%',
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                fontSize: '18px',
                color: '#fff',
                fontWeight: 700,
                transition: 'all 0.2s'
              }}
            >
              ℹ
            </button>
            <button
              onClick={onClose}
              style={{
                background: 'rgba(255,255,255,0.2)',
                border: 'none',
                borderRadius: '50%',
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                fontSize: '24px',
                color: '#fff',
                fontWeight: 700,
                transition: 'all 0.2s'
              }}
            >
              ×
            </button>
          </div>
        </div>

        {/* Content */}
        <div style={{ padding: "0 1.5rem 1.5rem" }}>
          
          {/* MODE SELECTION STEP */}
          {mode === null ? (
            <div style={{ textAlign: 'center', padding: '1rem 0' }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '1.5rem', color: '#333' }}>
                Choose a solving mode
              </h3>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1rem' }}>
                {/* Exhaustive Mode */}
                <button
                  onClick={() => setMode('exhaustive')}
                  style={{
                    padding: '1.25rem',
                    background: 'linear-gradient(135deg, #dbeafe, #bfdbfe)',
                    border: '2px solid #3b82f6',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
                  onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
                >
                  <div style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.5rem', color: '#1e40af' }}>
                    🔍 Exhaustive
                  </div>
                  <div style={{ fontSize: '0.9rem', color: '#1e3a8a' }}>
                    Randomized start per run • Deterministic after start • Explore different regions
                  </div>
                </button>

                {/* Balanced Mode */}
                <button
                  onClick={() => setMode('balanced')}
                  style={{
                    padding: '1.25rem',
                    background: 'linear-gradient(135deg, #dcfce7, #bbf7d0)',
                    border: '2px solid #22c55e',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
                  onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
                >
                  <div style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.5rem', color: '#15803d' }}>
                    ⚖️ Balanced (Recommended)
                  </div>
                  <div style={{ fontSize: '0.9rem', color: '#166534' }}>
                    Smart exploration • Good speed • Most versatile
                  </div>
                </button>

                {/* Fast Mode */}
                <button
                  onClick={() => setMode('fast')}
                  style={{
                    padding: '1.25rem',
                    background: 'linear-gradient(135deg, #fed7aa, #fdba74)',
                    border: '2px solid #f59e0b',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
                  onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
                >
                  <div style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.5rem', color: '#92400e' }}>
                    ⚡ Fast
                  </div>
                  <div style={{ fontSize: '0.9rem', color: '#78350f' }}>
                    Try many paths • Aggressive restarts • Quick exploration
                  </div>
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Max Solutions - Always visible */}
              <div style={sectionStyle}>
                <h4 style={sectionTitle}>🎯 Solutions to Find</h4>
                <div style={{ marginBottom: "0.75rem" }}>
                  <label style={labelStyle}>
                    Max Solutions
                  </label>
                  <input 
                    type="number" 
                    value={maxSolutions}
                    onChange={(e) => setMaxSolutions(e.target.value)}
                    onBlur={(e) => {
                      const val = parseInt(e.target.value);
                      if (isNaN(val) || val < 0) setMaxSolutions(1);
                      else setMaxSolutions(val);
                    }}
                    style={inputStyle}
                    min="0"
                    step="1"
                    placeholder="1"
                  />
                  <div style={{ fontSize: "12px", color: "#999", marginTop: "0.25rem" }}>
                    Stop after finding this many solutions. 0 = unlimited
                  </div>
                </div>
              </div>

              {/* Gravity Constraints - Always visible */}
              <div style={sectionStyle}>
                <h4 style={sectionTitle}>🎯 Gravity Constraints</h4>
                <div style={{ marginBottom: "0.75rem" }}>
                  <label style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '0.5rem',
                    cursor: 'pointer',
                    fontSize: '0.9rem'
                  }}>
                    <input
                      type="checkbox"
                      checked={gravityEnabled}
                      onChange={(e) => setGravityEnabled(e.target.checked)}
                      style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                    />
                    Enable gravity-supported placements
                  </label>
                  <div style={{ fontSize: "12px", color: "#999", marginTop: "0.25rem" }}>
                    Filter pieces to only allow stable positions (for puzzles with vertical walls or hollow interiors)
                  </div>
                </div>
              </div>

              {/* MODE-SPECIFIC INGREDIENTS */}
              
              {/* Timeout Ingredient */}
              {shouldShow("timeout") && (
                <div style={sectionStyle}>
            <h4 style={sectionTitle}>⏱️ Search Timeout</h4>
            <div style={{ marginBottom: "0.75rem" }}>
              <label style={labelStyle}>
                Timeout (seconds)
              </label>
              <input 
                type="number" 
                value={timeoutSec}
                onChange={(e) => setTimeoutSec(e.target.value)}
                onBlur={(e) => {
                  const val = parseInt(e.target.value);
                  if (isNaN(val) || val < 0) setTimeoutSec(0);
                  else setTimeoutSec(val);
                }}
                style={inputStyle}
                min="0"
                step="60"
                placeholder="0 = no limit"
              />
              <div style={{ fontSize: "12px", color: "#999", marginTop: "0.25rem" }}>
                0 = no timeout. Hard puzzles may need 30+ minutes (1800+ seconds)
              </div>
            </div>
          </div>
              )}

              {/* Randomness Ingredient */}
              {shouldShow("randomness") && (
                <div style={sectionStyle}>
                  <h4 style={sectionTitle}>🎲 Randomness</h4>
                  
                  {mode === "exhaustive" && (
                    <div style={{ 
                      padding: '0.75rem', 
                      background: '#dbeafe', 
                      borderRadius: '8px',
                      fontSize: '0.875rem',
                      fontWeight: 500,
                      marginBottom: '0.75rem',
                      color: '#1e40af'
                    }}>
                      <strong>ℹ️ Note:</strong> Each Exhaustive run fully explores one search region. Different runs start from different time-seeded initial orderings. Seed: {seed}
                    </div>
                  )}
                  
                  <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "14px", marginBottom: "0.75rem" }}>
                    <input 
                      type="checkbox" 
                      checked={randomizeTies}
                      onChange={(e) => setRandomizeTies(e.target.checked)}
                      disabled={mode === "exhaustive"}
                    />
                    <span>Randomize tie-breaking</span>
                    {mode === "exhaustive" && <span style={{ fontSize: "12px", color: "#999" }}>(disabled in Exhaustive)</span>}
                  </label>
                  
                  <div style={{ marginBottom: "0.75rem" }}>
                    <label style={labelStyle}>
                      Random Seed
                    </label>
                    <input 
                      type="number" 
                      value={seed}
                      onChange={(e) => setSeed(e.target.value)}
                      onBlur={(e) => {
                        const val = parseInt(e.target.value);
                        if (isNaN(val)) setSeed(12345);
                        else setSeed(val);
                      }}
                      style={inputStyle}
                      disabled={!randomizeTies || mode === "exhaustive"}
                    />
                    <div style={{ fontSize: "12px", color: "#999", marginTop: "0.25rem" }}>
                      Different seed = different search path
                    </div>
                  </div>
                </div>
              )}

              {/* Restart Strategy Ingredient */}
              {shouldShow("restart") && (
                <div style={sectionStyle}>
                  {mode === "exhaustive" ? (
                    <>
                      <h4 style={sectionTitle}>� Periodic Restart (Exhaustive)</h4>
                      <div style={{ fontSize: "12px", color: "#666", marginBottom: "0.75rem" }}>
                        Optional: restart the search every N seconds with a new piece order.
                      </div>

                      <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "14px", marginBottom: "0.75rem" }}>
                        <input
                          type="checkbox"
                          checked={exhaustiveRestartEnabled}
                          onChange={(e) => setExhaustiveRestartEnabled(e.target.checked)}
                        />
                        <span>Restart every X seconds</span>
                      </label>

                      <div style={{ marginBottom: "0.75rem" }}>
                        <label style={labelStyle}>
                          Restart Interval (seconds)
                        </label>
                        <input
                          type="number"
                          value={restartIntervalSeconds}
                          onChange={(e) => setRestartIntervalSeconds(e.target.value)}
                          onBlur={(e) => {
                            const val = parseFloat(e.target.value);
                            if (isNaN(val) || val < 0.1) setRestartIntervalSeconds(5);
                            else setRestartIntervalSeconds(val);
                          }}
                          style={inputStyle}
                          min="0.1"
                          step="0.1"
                          disabled={!exhaustiveRestartEnabled}
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      <h4 style={sectionTitle}>�� Piece Ordering Strategy</h4>
                      <div style={{ fontSize: "12px", color: "#666", marginBottom: "0.75rem" }}>
                        How to order pieces during search. Can dramatically affect solve time.
                      </div>

                      <div style={{ marginBottom: "0.75rem" }}>
                        <select
                          value={shuffleStrategy}
                          onChange={(e) => setShuffleStrategy(e.target.value as any)}
                          style={inputStyle}
                        >
                          <option value="none">None (Alphabetical)</option>
                          <option value="initial">Initial Shuffle (seed-based)</option>
                          <option value="periodicRestart">Periodic Restart (node-based)</option>
                          <option value="periodicRestartTime">Periodic Restart (time-based)</option>
                          <option value="adaptive">Adaptive Suffix Shuffle</option>
                        </select>
                      </div>

                      {shuffleStrategy === "periodicRestart" && (
                        <>
                          <div style={{ marginBottom: "0.75rem" }}>
                            <label style={labelStyle}>
                              Restart Interval (nodes)
                            </label>
                            <input
                              type="number"
                              value={restartInterval}
                              onChange={(e) => setRestartInterval(e.target.value)}
                              onBlur={(e) => {
                                const val = parseInt(e.target.value);
                                if (isNaN(val) || val < 1000) setRestartInterval(50000);
                                else setRestartInterval(val);
                              }}
                              style={inputStyle}
                              min="1000"
                              step="10000"
                            />
                            <div style={{ fontSize: "12px", color: "#999", marginTop: "0.25rem" }}>
                              Restart every N nodes with new piece order (default: 50,000). Unlimited restarts.
                            </div>
                          </div>
                        </>
                      )}

                      {shuffleStrategy === "periodicRestartTime" && (
                        <>
                          <div style={{ marginBottom: "0.75rem" }}>
                            <label style={labelStyle}>
                              Restart Interval (seconds)
                            </label>
                            <input
                              type="number"
                              value={restartIntervalSeconds}
                              onChange={(e) => setRestartIntervalSeconds(e.target.value)}
                              onBlur={(e) => {
                                const val = parseFloat(e.target.value);
                                if (isNaN(val) || val < 0.1) setRestartIntervalSeconds(5);
                                else setRestartIntervalSeconds(val);
                              }}
                              style={inputStyle}
                              min="0.1"
                              step="0.1"
                            />
                            <div style={{ fontSize: "12px", color: "#999", marginTop: "0.25rem" }}>
                              Restart every N seconds with new piece order (e.g. 0.5 for half second). Unlimited restarts.
                            </div>
                          </div>
                        </>
                      )}

                      {shuffleStrategy === "adaptive" && (
                        <>
                          <div style={{ marginBottom: "0.75rem" }}>
                            <label style={labelStyle}>
                              Trigger at depth &lt;
                            </label>
                            <input
                              type="number"
                              value={shuffleTriggerDepth}
                              onChange={(e) => setShuffleTriggerDepth(e.target.value)}
                              onBlur={(e) => {
                                const val = parseInt(e.target.value);
                                if (isNaN(val) || val < 1) setShuffleTriggerDepth(8);
                                else setShuffleTriggerDepth(val);
                              }}
                              style={inputStyle}
                              min="1"
                              step="1"
                            />
                            <div style={{ fontSize: "12px", color: "#999", marginTop: "0.25rem" }}>
                              Shuffle when backtracking below this depth (default: 8)
                            </div>
                          </div>

                          <div style={{ marginBottom: "0.75rem" }}>
                            <label style={labelStyle}>
                              Max shuffles per branch
                            </label>
                            <input
                              type="number"
                              value={maxSuffixShuffles}
                              onChange={(e) => setMaxSuffixShuffles(e.target.value)}
                              onBlur={(e) => {
                                const val = parseInt(e.target.value);
                                if (isNaN(val) || val < 1) setMaxSuffixShuffles(5);
                                else setMaxSuffixShuffles(val);
                              }}
                              style={inputStyle}
                              min="1"
                              step="1"
                            />
                            <div style={{ fontSize: "12px", color: "#999", marginTop: "0.25rem" }}>
                              Max shuffles per search branch (default: 5)
                            </div>
                          </div>
                        </>
                      )}
                    </>
                  )}
              </div>
              )}

              {/* Tail Solver Ingredient (DLX Only) */}
              {shouldShow("tail") && (
              <div style={sectionStyle}>
                <h4 style={sectionTitle}>🚀 Tail Solver (DLX Exact Cover)</h4>
                <div style={{ fontSize: "12px", color: "#666", marginBottom: "0.75rem" }}>
                  Use DLX exact cover algorithm for fast endgame completion
                </div>
                
                <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "14px", marginBottom: "0.75rem" }}>
                  <input 
                    type="checkbox" 
                    checked={tailEnable}
                    onChange={(e) => setTailEnable(e.target.checked)}
                  />
                  <span>Enable DLX tail solver (recommended)</span>
                </label>
                
                <div style={{ marginBottom: "0.75rem" }}>
                  <label style={labelStyle}>
                    Threshold (open cells)
                  </label>
                  <input 
                    type="number" 
                    value={dlxThreshold}
                    onChange={(e) => setDlxThreshold(e.target.value)}
                    onBlur={(e) => {
                      const val = parseInt(e.target.value);
                      if (isNaN(val) || val < 10) setDlxThreshold(100);
                      else setDlxThreshold(val);
                    }}
                    style={inputStyle}
                    min="10"
                    step="10"
                    disabled={!tailEnable}
                  />
                  <div style={{ fontSize: "12px", color: "#999", marginTop: "0.25rem" }}>
                    Use DLX when open cells ≤ this value (default: 100)
                  </div>
                </div>
                
                <div style={{ marginBottom: "0.75rem" }}>
                  <label style={labelStyle}>
                    Timeout (seconds)
                  </label>
                  <input 
                    type="number" 
                    value={dlxTimeoutSec}
                    onChange={(e) => setDlxTimeoutSec(e.target.value)}
                    onBlur={(e) => {
                      const val = parseInt(e.target.value);
                      if (isNaN(val) || val < 1) setDlxTimeoutSec(30);
                      else setDlxTimeoutSec(val);
                    }}
                    style={inputStyle}
                    min="1"
                    step="5"
                    disabled={!tailEnable}
                  />
                  <div style={{ fontSize: "12px", color: "#999", marginTop: "0.25rem" }}>
                    Max time for DLX solver (default: 30 seconds)
                  </div>
                </div>
              </div>
              )}

              {/* Pruning Section */}
              <div style={sectionStyle}>
                <h4 style={sectionTitle}>✂️ Pruning Rules</h4>
                <div style={{ fontSize: "12px", color: "#666", marginBottom: "0.75rem" }}>
                  Advanced pruning to detect dead-ends earlier
                </div>
                
                <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "14px", marginBottom: "0.5rem" }}>
                  <input 
                    type="checkbox" 
                    checked={connectivityPruning}
                    onChange={(e) => setConnectivityPruning(e.target.checked)}
                  />
                  <span>Connectivity pruning (detect isolated regions)</span>
                </label>
                <div style={{ fontSize: "12px", color: "#999", marginLeft: "1.5rem", marginBottom: "0.5rem" }}>
                  Prunes placements that create unfillable pockets. Reduces nodes by ~70% on hard puzzles.
                </div>
              </div>

              {/* Parallel Workers Section */}
              <div style={sectionStyle}>
                <h4 style={sectionTitle}>⚡ Parallel Workers</h4>
                <div style={{ fontSize: "12px", color: "#666", marginBottom: "0.75rem" }}>
                  Run multiple solvers in parallel on different CPU cores
                </div>
                
                <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "14px", marginBottom: "0.75rem" }}>
                  <input 
                    type="checkbox" 
                    checked={parallelEnabled}
                    onChange={(e) => setParallelEnabled(e.target.checked)}
                    disabled={gpuEnabled}
                  />
                  <span>Enable parallel workers ({navigator.hardwareConcurrency || 4} cores available)</span>
                  {gpuEnabled && <span style={{ fontSize: "12px", color: "#999" }}>(disabled when GPU enabled)</span>}
                </label>
                
                {parallelEnabled && !gpuEnabled && (
                  <div style={{ marginBottom: "0.75rem" }}>
                    <label style={labelStyle}>
                      Number of workers
                    </label>
                    <input 
                      type="number" 
                      value={workerCount}
                      onChange={(e) => setWorkerCount(Math.max(1, Math.min(navigator.hardwareConcurrency || 8, parseInt(e.target.value) || 1)))}
                      style={inputStyle}
                      min="1"
                      max={navigator.hardwareConcurrency || 8}
                      step="1"
                    />
                    <div style={{ fontSize: "12px", color: "#999", marginTop: "0.25rem" }}>
                      Each worker searches with a different random seed. More workers = faster solution finding.
                    </div>
                  </div>
                )}
              </div>

              {/* GPU Solver Section */}
              <div style={{
                ...sectionStyle,
                background: gpuCapability?.supported ? 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)' : '#f9fafb',
                padding: '1rem',
                borderRadius: '8px',
                border: gpuCapability?.supported ? '2px solid #22c55e' : '1px solid #e5e7eb'
              }}>
                <h4 style={{ ...sectionTitle, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  🎮 GPU Solver {gpuCapability?.supported ? '(Available)' : '(Not Available)'}
                </h4>
                
                {!gpuCapability?.supported ? (
                  <div style={{ fontSize: "13px", color: "#666", padding: '0.5rem', background: '#fff', borderRadius: '4px' }}>
                    <strong>WebGPU not available:</strong> {gpuCapability?.reason || 'Checking...'}
                    <div style={{ marginTop: '0.5rem', fontSize: '12px', color: '#999' }}>
                      GPU solving requires a browser with WebGPU support (Chrome 113+, Edge 113+, or Firefox Nightly with flags).
                    </div>
                  </div>
                ) : (
                  <>
                    <div style={{ fontSize: "12px", color: "#166534", marginBottom: "0.75rem" }}>
                      Massively parallel search using your GPU. Based on the Puzzle Processor architecture.
                    </div>
                    
                    <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "14px", marginBottom: "0.75rem" }}>
                      <input 
                        type="checkbox" 
                        checked={gpuEnabled}
                        onChange={(e) => {
                          setGpuEnabled(e.target.checked);
                          if (e.target.checked) {
                            setParallelEnabled(false); // Disable CPU parallel when GPU enabled
                          }
                        }}
                      />
                      <span style={{ fontWeight: 600 }}>Enable GPU solver</span>
                    </label>
                    
                    {gpuEnabled && (
                      <>
                        <div style={{ 
                          padding: '0.75rem', 
                          background: '#dcfce7', 
                          borderRadius: '6px',
                          fontSize: '0.875rem',
                          marginBottom: '0.75rem',
                          color: '#166534'
                        }}>
                          <strong>How it works:</strong> The puzzle is compiled into millions of parallel search prefixes. 
                          Each GPU thread explores a different branch simultaneously, exhausting vast regions of the search space.
                        </div>
                        
                        <div style={{ marginBottom: "0.75rem" }}>
                          <label style={labelStyle}>
                            Prefix Depth (k)
                          </label>
                          <input 
                            type="number" 
                            value={gpuPrefixDepth}
                            onChange={(e) => setGpuPrefixDepth(e.target.value)}
                            onBlur={(e) => {
                              const val = parseInt(e.target.value);
                              if (isNaN(val) || val < 3) setGpuPrefixDepth(6);
                              else if (val > 12) setGpuPrefixDepth(12);
                              else setGpuPrefixDepth(val);
                            }}
                            style={inputStyle}
                            min="3"
                            max="12"
                            step="1"
                          />
                          <div style={{ fontSize: "12px", color: "#999", marginTop: "0.25rem" }}>
                            Higher = more prefixes, better parallelism. 6-8 recommended. (3-12 range)
                          </div>
                        </div>
                        
                        <div style={{ marginBottom: "0.75rem" }}>
                          <label style={labelStyle}>
                            Thread Budget (fit-tests)
                          </label>
                          <input 
                            type="number" 
                            value={gpuThreadBudget}
                            onChange={(e) => setGpuThreadBudget(e.target.value)}
                            onBlur={(e) => {
                              const val = parseInt(e.target.value);
                              if (isNaN(val) || val < 10000) setGpuThreadBudget(100000);
                              else setGpuThreadBudget(val);
                            }}
                            style={inputStyle}
                            min="10000"
                            step="10000"
                          />
                          <div style={{ fontSize: "12px", color: "#999", marginTop: "0.25rem" }}>
                            Operations per GPU thread before checkpoint. Higher = less overhead, but less responsive.
                          </div>
                        </div>
                      </>
                    )}
                  </>
                )}
              </div>
            </>
          )}

          {/* Benchmark Section */}
          {puzzleId && (
            <div style={sectionStyle}>
              <div style={sectionTitle}>🔬 Performance Benchmark</div>
              <div style={{ fontSize: "13px", color: "#666", marginBottom: "0.75rem" }}>
                Run comparative benchmarks to measure solver performance across different configurations.
              </div>
              
              <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "0.75rem" }}>
                <label style={{ fontSize: "14px" }}>Trials per config:</label>
                <input
                  type="number"
                  value={benchmarkTrials}
                  onChange={(e) => setBenchmarkTrials(Math.max(1, parseInt(e.target.value) || 1))}
                  style={{ ...inputStyle, width: "80px" }}
                  min="1"
                  max="10"
                  disabled={benchmarkRunning}
                />
                <button
                  className="btn"
                  onClick={async () => {
                    if (!puzzleId || !puzzleGeometry || !pieceDB || !puzzleStats) {
                      alert('Missing puzzle data for benchmark');
                      return;
                    }
                    setBenchmarkRunning(true);
                    setBenchmarkResult(null);
                    try {
                      const input: BenchmarkInput = {
                        puzzleId,
                        puzzleName: puzzleStats.puzzleName,
                        geometry: puzzleGeometry,
                        pieceDB,
                      };
                      const result = await runBenchmark(input, benchmarkTrials);
                      setBenchmarkResult(result);
                    } catch (err) {
                      console.error('Benchmark failed:', err);
                      alert('Benchmark failed: ' + (err as Error).message);
                    } finally {
                      setBenchmarkRunning(false);
                    }
                  }}
                  disabled={benchmarkRunning || !puzzleGeometry || !pieceDB}
                  style={{
                    background: benchmarkRunning ? "#ccc" : "#10b981",
                    color: "#fff",
                    padding: "0.5rem 1rem",
                    cursor: benchmarkRunning ? "not-allowed" : "pointer",
                  }}
                >
                  {benchmarkRunning ? "Running..." : "Run Benchmark"}
                </button>
              </div>

              {benchmarkResult && (
                <div style={{ 
                  background: "#f8fafc", 
                  border: "1px solid #e2e8f0", 
                  borderRadius: "6px", 
                  padding: "1rem",
                  fontSize: "13px"
                }}>
                  <div style={{ fontWeight: 600, marginBottom: "0.5rem" }}>
                    Results: {benchmarkResult.puzzleName}
                  </div>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                        <th style={{ textAlign: "left", padding: "0.25rem 0.5rem" }}>Config</th>
                        <th style={{ textAlign: "right", padding: "0.25rem 0.5rem" }}>Avg Time</th>
                        <th style={{ textAlign: "right", padding: "0.25rem 0.5rem" }}>Avg Nodes</th>
                        <th style={{ textAlign: "right", padding: "0.25rem 0.5rem" }}>DLX Time</th>
                        <th style={{ textAlign: "right", padding: "0.25rem 0.5rem" }}>Success</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(benchmarkResult.summary).map(([name, stats]) => (
                        <tr key={name} style={{ borderBottom: "1px solid #f0f0f0" }}>
                          <td style={{ padding: "0.25rem 0.5rem" }}>{name}</td>
                          <td style={{ textAlign: "right", padding: "0.25rem 0.5rem" }}>{(stats.avgElapsedMs / 1000).toFixed(1)}s</td>
                          <td style={{ textAlign: "right", padding: "0.25rem 0.5rem" }}>{stats.avgNodes.toLocaleString()}</td>
                          <td style={{ textAlign: "right", padding: "0.25rem 0.5rem" }}>{(stats.avgDlxMs / 1000).toFixed(1)}s</td>
                          <td style={{ textAlign: "right", padding: "0.25rem 0.5rem" }}>{(stats.successRate * 100).toFixed(0)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  
                  <button
                    className="btn"
                    onClick={() => {
                      const blob = new Blob([JSON.stringify(benchmarkResult, null, 2)], { type: 'application/json' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `benchmark-${benchmarkResult.puzzleId}-${Date.now()}.json`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                    style={{ marginTop: "0.75rem", fontSize: "12px" }}
                  >
                    📥 Download JSON
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end", paddingTop: "0.75rem", borderTop: "1px solid #f0f0f0", padding: "0 1.5rem 1.5rem" }}>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button 
            className="btn" 
            onClick={handleSave} 
            disabled={mode === null}
            style={{ 
              background: mode === null ? "#ccc" : "#007bff", 
              color: "#fff",
              cursor: mode === null ? "not-allowed" : "pointer",
              opacity: mode === null ? 0.6 : 1
            }}
          >
            Save Settings
          </button>
        </div>
      </div>

      {/* Info Modal */}
      <InfoModal
      isOpen={showInfo}
      onClose={() => setShowInfo(false)}
      title="Your Solver Configuration"
    >
      {mode ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', fontSize: '0.95rem' }}>
          {/* Puzzle Stats Card */}
          {puzzleStats && (
            <div style={{ 
              padding: '1rem', 
              background: '#f0f9ff', 
              borderLeft: '3px solid #3b82f6',
              borderRadius: '6px',
              fontSize: '0.875rem'
            }}>
              {buildInfoSummary().puzzleLines.map((line, i) => (
                <div key={i} style={{ marginBottom: i < buildInfoSummary().puzzleLines.length - 1 ? '0.25rem' : 0 }}>
                  {line.startsWith('**') ? <strong>{line.replace(/\*\*/g, '')}</strong> : line}
                </div>
              ))}
            </div>
          )}
          
          {/* Strategy Summary */}
          <div style={{ 
            padding: '1rem', 
            background: '#fef3c7', 
            borderLeft: '3px solid #f59e0b',
            borderRadius: '6px'
          }}>
            <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '1rem' }}>
              {buildInfoSummary().headline}
            </h4>
            {buildInfoSummary().bullets.map((bullet, i) => (
              <div key={i} style={{ fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                {bullet.includes('**') ? (
                  <>
                    <strong>{bullet.split('**')[1]}</strong>
                    {bullet.split('**')[2]}
                  </>
                ) : bullet}
              </div>
            ))}
          </div>
          
          {/* Wow Line */}
          <div style={{ 
            padding: '1rem', 
            background: '#f0fdf4', 
            borderLeft: '3px solid #22c55e',
            borderRadius: '6px',
            fontSize: '0.875rem',
            fontStyle: 'italic'
          }}>
            {buildInfoSummary().wowLine}
          </div>
        </div>
      ) : (
        <div style={{ padding: '1rem', textAlign: 'center', color: '#999' }}>
          Select a solving mode to see your configuration summary.
        </div>
      )}
    </InfoModal>
    </>
  );
};

// Updated to use modern festive design - old styles removed

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.5rem",
  border: "1px solid #ddd",
  borderRadius: 4,
  fontSize: "14px"
};

const sectionStyle: React.CSSProperties = {
  marginBottom: "1.5rem",
  paddingBottom: "1rem",
  borderBottom: "1px solid #f0f0f0"
};

const sectionTitle: React.CSSProperties = {
  fontSize: "14px",
  fontWeight: 600,
  marginBottom: "0.75rem",
  color: "#333"
};

const labelStyle: React.CSSProperties = {
  display: "block",
  marginBottom: "0.5rem",
  fontWeight: 500,
  fontSize: "14px"
};
