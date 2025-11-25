# PowerShell script to remove movie code from SolvePage.tsx
# Run from project root: .\clean-solvepage.ps1

$file = "src\pages\solve\SolvePage.tsx"
$content = Get-Content $file -Raw

Write-Host "Original size: $($content.Length) characters"

# Remove movie imports (lines 14, 19-29, 33-35)
$content = $content -replace "import \{ getMovieById, incrementMovieViews, type MovieRecord \} from '\.\.\/\.\.\/api\/movies';\r?\n", ""
$content = $content -replace "\/\/ Movie Mode - Effects System\r?\nimport \{ buildEffectContext, type EffectContext \} from '\.\.\/\.\.\/studio\/EffectContext';\r?\nimport \{ TransportBar \} from '\.\.\/\.\.\/studio\/TransportBar';\r?\nimport \{ TurnTableModal \} from '\.\.\/\.\.\/effects\/turntable\/TurnTableModal';\r?\nimport \{ RevealModal \} from '\.\.\/\.\.\/effects\/reveal\/RevealModal';\r?\nimport \{ GravityModal \} from '\.\.\/\.\.\/effects\/gravity\/GravityModal';\r?\nimport \{ GravityEffect \} from '\.\.\/\.\.\/effects\/gravity\/GravityEffect';\r?\nimport \{ TurnTableEffect \} from '\.\.\/\.\.\/effects\/turntable\/TurnTableEffect';\r?\nimport \{ RevealEffect \} from '\.\.\/\.\.\/effects\/reveal\/RevealEffect';\r?\nimport \{ CreditsModal, type CreditsData \} from '\.\.\/\.\.\/components\/CreditsModal';\r?\nimport \{ ChallengeOverlay \} from '\.\.\/\.\.\/components\/ChallengeOverlay';\r?\n", ""
$content = $content -replace "import type \{ TurnTableConfig \} from '\.\.\/\.\.\/effects\/turntable\/presets';\r?\nimport type \{ RevealConfig \} from '\.\.\/\.\.\/effects\/reveal\/presets';\r?\nimport type \{ GravityEffectConfig \} from '\.\.\/\.\.\/effects\/gravity\/types';\r?\nimport \* as THREE from 'three';\r?\n", ""

# Change SolveMode type
$content = $content -replace "type SolveMode = 'manual' \| 'automated' \| 'movie';", "type SolveMode = 'manual' | 'automated';"

Write-Host "Cleaned size: $($content.Length) characters"
Write-Host "Reduction: $(($content.Length - (Get-Content $file -Raw).Length)) characters"

# Save cleaned version
$content | Set-Content $file -NoNewline

Write-Host "✅ Cleaned SolvePage.tsx"
Write-Host "⚠️  Note: Manual cleanup of code blocks still needed"
Write-Host "Run 'npm run dev' to check for remaining errors"
