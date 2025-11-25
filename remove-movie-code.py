#!/usr/bin/env python3
"""
Remove all movie-related code from SolvePage.tsx
Deletes specific line ranges identified as movie code.
"""

# Line ranges to DELETE (1-indexed, inclusive)
# Format: (start_line, end_line, description)
DELETE_RANGES = [
    # Movie imports
    (14, 14, "getMovieById import"),
    (20, 30, "Movie Mode imports block"),
    (33, 36, "Movie type imports"),
    (3, 3, "createPortal import"),
    
    # State variables
    (58, 62, "Movie playback state"),
    (141, 185, "Movie Mode state variables"),
    
    # useEffects - movie loading
    (546, 726, "Load movie from URL"),
    (728, 747, "Detect shared link"),
    
    # useEffects - effects system
    (1829, 1849, "Build effect context"),
    (1851, 1875, "Auto-activate effect"),
    (2275, 2296, "Tick loop for effects"),
    (2298, 2370, "Auto-play gallery movie"),
    (2371, 2445, "Sync auto-solution to movie mode"),
    (2446, 2457, "Save original state"),
    (2459, 2531, "Set onComplete callback"),
    (2533, 2546, "Cleanup on mode switch"),
    (2548, 2560, "Close effects dropdown"),
    
    # Handler functions
    (2025, 2273, "Effect handlers and credits handlers"),
    (1877, 2023, "Effect activation/clear/select handlers"),
    
    # JSX - CreditsModal and ChallengeOverlay
    (3333, 3398, "CreditsModal and ChallengeOverlay JSX"),
]

def main():
    input_file = r"c:\Projects\Koos puzzle v1\src\pages\solve\SolvePage.tsx"
    output_file = r"c:\Projects\Koos puzzle v1\src\pages\solve\SolvePage.tsx.cleaned"
    
    # Read all lines
    with open(input_file, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    # Create set of lines to delete (convert to 0-indexed)
    lines_to_delete = set()
    for start, end, desc in DELETE_RANGES:
        print(f"Marking for deletion: lines {start}-{end} ({desc})")
        for line_num in range(start - 1, end):  # Convert to 0-indexed
            lines_to_delete.add(line_num)
    
    # Filter out deleted lines
    kept_lines = [line for i, line in enumerate(lines) if i not in lines_to_delete]
    
    # Write output
    with open(output_file, 'w', encoding='utf-8') as f:
        f.writelines(kept_lines)
    
    print(f"\nOriginal lines: {len(lines)}")
    print(f"Lines deleted: {len(lines_to_delete)}")
    print(f"Remaining lines: {len(kept_lines)}")
    print(f"\nCleaned file written to: {output_file}")
    print("Review the file, then copy it over the original if it looks good.")

if __name__ == '__main__':
    main()
