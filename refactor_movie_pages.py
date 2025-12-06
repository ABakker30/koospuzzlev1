#!/usr/bin/env python3
"""
Refactor movie pages to use headless controllers.
Transforms old direct effect management to new headless controller pattern.
"""

import re
from pathlib import Path
from typing import Dict, List, Tuple

# Effect configurations
EFFECTS = {
    'turntable': {
        'old_import': "from '../../effects/turntable/TurnTableEffect';",
        'new_import': "// import { TurnTableEffect } from '../../effects/turntable/TurnTableEffect'; // OLD: direct management\nimport MovieTurntablePlayer, { type TurntableMovieHandle } from '../../effects/turntable/MovieTurntablePlayer'; // NEW: headless controller",
        'config_type': 'TurnTableConfig',
        'default_config': 'DEFAULT_CONFIG',
        'effect_name': 'Turntable',
        'ref_name': 'turntablePlayerRef',
        'handle_type': 'TurntableMovieHandle',
    },
    'reveal': {
        'old_import': "from '../../effects/reveal/RevealEffect';",
        'new_import': "// import { RevealEffect } from '../../effects/reveal/RevealEffect'; // OLD: direct management\nimport MovieRevealPlayer, { type RevealMovieHandle } from '../../effects/reveal/MovieRevealPlayer'; // NEW: headless controller",
        'config_type': 'RevealConfig',
        'default_config': 'DEFAULT_CONFIG',
        'effect_name': 'Reveal',
        'ref_name': 'revealPlayerRef',
        'handle_type': 'RevealMovieHandle',
    },
    'orbit': {
        'old_import': "from '../../effects/orbit/OrbitEffect';",
        'new_import': "// import { OrbitEffect } from '../../effects/orbit/OrbitEffect'; // OLD: direct management\nimport MovieOrbitPlayer, { type OrbitMovieHandle } from '../../effects/orbit/MovieOrbitPlayer'; // NEW: headless controller",
        'config_type': 'OrbitConfig',
        'default_config': 'DEFAULT_CONFIG',
        'effect_name': 'Orbit',
        'ref_name': 'orbitPlayerRef',
        'handle_type': 'OrbitMovieHandle',
    },
    'explosion': {
        'old_import': "from '../../effects/explosion/ExplosionEffect';",
        'new_import': "// import { ExplosionEffect } from '../../effects/explosion/ExplosionEffect'; // OLD: direct management\nimport MovieExplosionPlayer, { type ExplosionMovieHandle } from '../../effects/explosion/MovieExplosionPlayer'; // NEW: headless controller",
        'config_type': 'ExplosionConfig',
        'default_config': 'DEFAULT_CONFIG',
        'effect_name': 'Explosion',
        'ref_name': 'explosionPlayerRef',
        'handle_type': 'ExplosionMovieHandle',
    }
}

def refactor_file(filepath: Path, effect_key: str) -> bool:
    """Refactor a single movie page file."""
    
    if not filepath.exists():
        print(f"❌ File not found: {filepath}")
        return False
    
    config = EFFECTS[effect_key]
    content = filepath.read_text(encoding='utf-8')
    original_content = content
    
    print(f"\n{'='*60}")
    print(f"Refactoring: {filepath.name}")
    print(f"Effect: {effect_key.title()}")
    print(f"{'='*60}\n")
    
    # Step 1: Replace import
    print("1️⃣ Updating imports...")
    # Match the actual import line format
    old_import_line = f"import {{ {config['effect_name']}Effect }} {config['old_import']}"
    content = content.replace(old_import_line, config['new_import'])
    
    # Step 2: Replace state declaration
    print("2️⃣ Updating state declarations...")
    old_state = "  const [activeEffectInstance, setActiveEffectInstance] = useState<any>(null);"
    new_state = f"  const {config['ref_name']} = useRef<{config['handle_type']} | null>(null);"
    content = content.replace(old_state, new_state)
    
    # Step 3: Replace all activeEffectInstance references
    print("3️⃣ Replacing activeEffectInstance references...")
    
    # These need special handling
    replacements = [
        # Simple method calls
        (r'activeEffectInstance\.play\(\)', f"{config['ref_name']}.current?.play()"),
        (r'activeEffectInstance\.pause\(\)', f"{config['ref_name']}.current?.pause()"),
        (r'activeEffectInstance\.stop\(\)', f"{config['ref_name']}.current?.stop()"),
        (r'activeEffectInstance\.dispose\(\)', f"{config['ref_name']}.current?.dispose()"),
        (r'activeEffectInstance\.getConfig\(\)', f"{config['ref_name']}.current?.getConfig()"),
        (r'activeEffectInstance\.setRecording\(', f"{config['ref_name']}.current?.setRecording("),
        (r'activeEffectInstance\.setConfig\(', f"{config['ref_name']}.current?.setConfig("),
        
        # Conditional checks
        (r'if \(activeEffectInstance\)', f"if ({config['ref_name']}.current)"),
        (r'if \(!activeEffectInstance\)', f"if (!{config['ref_name']}.current)"),
        (r'activeEffectInstance \&\& \(', f"{config['ref_name']}.current && ("),
        (r'\{activeEffectInstance \&\&', f"{{{config['ref_name']}.current &&"),
        
        # Optional chaining
        (r'activeEffectInstance\?\.', f"{config['ref_name']}.current?."),
    ]
    
    for pattern, replacement in replacements:
        content = re.sub(pattern, replacement, content)
    
    # Step 4: Remove old manual effect management code
    print("4️⃣ Removing old manual effect management code...")
    
    # Remove auto-activate useEffect (varies by effect but generally similar structure)
    old_auto_activate_pattern = re.compile(
        r'  // Auto-activate effect when context is ready\n'
        r'  useEffect\(\(\) => \{.*?\n'
        r'  \}, \[effectContext, activeEffectInstance, movie\]\);',
        re.DOTALL
    )
    content = old_auto_activate_pattern.sub('', content)
    
    # Remove handleActivateEffect function
    old_activate_handler_pattern = re.compile(
        r'  // Handle .* activation\n'
        r'  const handleActivateEffect = .*?\n'
        r'  \};',
        re.DOTALL
    )
    content = old_activate_handler_pattern.sub('', content)
    
    # Remove animation loop useEffect
    old_animation_loop_pattern = re.compile(
        r'  // Animation loop - tick the active effect on every frame\n'
        r'  useEffect\(\(\) => \{.*?\n'
        r'  \}, \[.*?\]\);',
        re.DOTALL
    )
    content = old_animation_loop_pattern.sub('', content)
    
    # Remove auto-play useEffect
    old_autoplay_pattern = re.compile(
        r'  // Auto-play effect when autoplay parameter is present\n'
        r'  useEffect\(\(\) => \{.*?\n'
        r'  \}, \[.*?\]\);',
        re.DOTALL
    )
    content = old_autoplay_pattern.sub('', content)
    
    # Step 5: Add config memo and handleEffectComplete
    print("5️⃣ Adding initial config memo and handleEffectComplete...")
    
    # Find where to insert (after context-aware modals section)
    insert_marker = "  }, [solution, movie, from, mode]);"
    if insert_marker in content:
        initial_config = f"""
  
  // Compute initial {effect_key} config (used by Movie{config['effect_name']}Player)
  const initial{config['effect_name']}Config: {config['config_type']} = useMemo(() => {{
    const baseConfig = movie?.effect_config || {config['default_config']};
    return {{
      ...baseConfig,
      preserveControls: true,
    }};
  }}, [movie]);

  // Handle {config['effect_name']}Effect completion (replaces setOnComplete)
  const handleEffectComplete = () => {{
    const currentRecordingState = recordingStatusRef.current.state;
    console.log('🎬 {config['effect_name']} effect completed. Recording state:', currentRecordingState);
    setIsPlaying(false);
    
    // Capture thumbnail when effect completes (if not already captured)
    if (!thumbnailBlob && canvas && mode !== 'view') {{
      requestAnimationFrame(() => requestAnimationFrame(() => {{
        import('../../services/thumbnailService').then(({{ captureCanvasScreenshot }}) => {{
          captureCanvasScreenshot(canvas).then(blob => {{
            setThumbnailBlob(blob);
          }}).catch(err => {{
            console.error('❌ Failed to capture thumbnail:', err);
          }});
        }});
      }}));
    }}
    
    // If recording, stop it and trigger download
    if (currentRecordingState === 'recording') {{
      console.log('🎬 Effect complete during recording - stopping recording...');
      handleStopRecordingAndDownload();
    }} else {{
      // Show appropriate post-playback modal after 3 second delay
      setTimeout(() => {{
        if (from === 'gallery') {{
          setShowWhatsNext(true);
        }} else if (from === 'share') {{
          setShowShareWelcome(true);
        }} else if (movie) {{
          // Viewing a saved movie directly - show What's Next
          setShowWhatsNext(true);
        }} else if (mode === 'create') {{
          // Creating a new movie from manual solver - go directly to What's Next
          setShowWhatsNext(true);
        }}
      }}, 3000);
    }}
  }};
"""
        content = content.replace(insert_marker, insert_marker + initial_config)
    
    # Step 6: Add headless controller JSX before closing canvas div
    print("6️⃣ Adding headless controller JSX...")
    
    # Find the SceneCanvas closing and add the headless controller after it
    canvas_marker = "        )}\n        \n        {/* Reveal / Explosion Sliders"
    if canvas_marker in content:
        # Build JSX with proper single braces (not using f-string for the JSX part)
        controller_jsx = """        )}

        {/* Headless """ + effect_key + """ controller (no visual) */}
        {effectContext && (
          <Movie""" + config['effect_name'] + """Player
            ref={""" + config['ref_name'] + """}
            effectContext={effectContext}
            baseConfig={initial""" + config['effect_name'] + """Config}
            autoplay={autoplay}
            loop={false}
            onComplete={handleEffectComplete}
          />
        )}
        
        {/* Reveal / Explosion Sliders"""
        content = content.replace(canvas_marker, controller_jsx)
    
    # Check if anything changed
    if content == original_content:
        print("⚠️ No changes made")
        return False
    
    # Write back
    filepath.write_text(content, encoding='utf-8')
    print("✅ Refactoring complete!")
    return True


def main():
    """Main refactoring script."""
    base_path = Path(__file__).parent / 'src' / 'pages' / 'movies'
    
    files_to_refactor = [
        (base_path / 'TurntableMoviePage.tsx', 'turntable'),
        (base_path / 'RevealMoviePage.tsx', 'reveal'),
        (base_path / 'OrbitMoviePage.tsx', 'orbit'),
        (base_path / 'ExplosionMoviePage.tsx', 'explosion'),
    ]
    
    print("\n" + "="*60)
    print("MOVIE PAGE REFACTORING SCRIPT")
    print("Converting to Headless Controller Pattern")
    print("="*60)
    
    results = []
    for filepath, effect_key in files_to_refactor:
        success = refactor_file(filepath, effect_key)
        results.append((filepath.name, success))
    
    print("\n" + "="*60)
    print("SUMMARY")
    print("="*60)
    for filename, success in results:
        status = "✅ SUCCESS" if success else "❌ FAILED"
        print(f"{status}: {filename}")
    print("="*60 + "\n")


if __name__ == '__main__':
    main()
