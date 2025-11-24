# Script to create movie effect pages from TurntableMoviePage template

$effects = @(
    @{Name="Gravity"; Type="gravity"; Modal="GravityModal"},
    @{Name="Reveal"; Type="reveal"; Modal="RevealModal"},
    @{Name="Explosion"; Type="explosion"; Modal="ExplosionModal"},
    @{Name="Orbit"; Type="orbit"; Modal="OrbitModal"}
)

$templatePath = "src\pages\movies\TurntableMoviePage.tsx"
$template = Get-Content $templatePath -Raw

foreach ($effect in $effects) {
    $name = $effect.Name
    $type = $effect.Type
    $modal = $effect.Modal
    
    Write-Host "Creating ${name}MoviePage..."
    
    # Perform replacements
    $content = $template
    
    # Component names
    $content = $content -replace 'TurntableMoviePage', "${name}MoviePage"
    $content = $content -replace 'Turntable Movie Page', "${name} Movie Page"
    $content = $content -replace 'Turntable Movie', "${name} Movie"
    
    # Effect imports and classes
    $content = $content -replace "from '../../effects/turntable/TurnTableEffect'", "from '../../effects/${type}/${name}Effect'"
    $content = $content -replace "from '../../effects/turntable/TurnTableModal'", "from '../../effects/${type}/${modal}'"
    $content = $content -replace "from '../../effects/turntable/presets'", "from '../../effects/${type}/presets'"
    $content = $content -replace 'TurnTableEffect', "${name}Effect"
    $content = $content -replace 'TurnTableModal', "${modal}"
    $content = $content -replace 'TurnTableConfig', "${name}Config"
    $content = $content -replace 'DEFAULT_CONFIG', "DEFAULT_CONFIG"
    
    # Effect type strings
    $content = $content -replace "effect_type: 'turntable'", "effect_type: '${type}'"
    $content = $content -replace "effectType=`"Turntable`"", "effectType=`"${name}`""
    $content = $content -replace "effectType=`"turntable`"", "effectType=`"${type}`""
    
    # URL paths
    $content = $content -replace '/movies/turntable/', "/movies/${type}/"
    $content = $content -replace 'turntable-movie', "${type}-movie"
    $content = $content -replace "'turntable-movie'", "'${type}-movie'"
    $content = $content -replace "screen: 'turntable-movie'", "screen: '${type}-movie'"
    $content = $content -replace 'recording-turntable', "recording-${type}"
    $content = $content -replace "${type}-playback", "${type}-playback"
    
    # Modal state names
    $content = $content -replace 'showTurnTableModal', "show${name}Modal"
    $content = $content -replace 'setShowTurnTableModal', "setShow${name}Modal"
    $content = $content -replace 'handleTurnTableSave', "handle${name}Save"
    
    # Download filename
    $content = $content -replace "turntable-`\${Date.now()}.webm", "${type}-`\${Date.now()}.webm"
    
    # Button labels and descriptions
    $content = $content -replace '🎬 Turntable', "🎬 ${name}"
    $content = $content -replace 'turntable with config', "${type} with config"
    $content = $content -replace 'Turntable effect completed', "${name} effect completed"
    $content = $content -replace 'Turntable settings saved', "${name} settings saved"
    
    # Export statement
    $content = $content -replace 'export default TurntableMoviePage', "export default ${name}MoviePage"
    
    # Write to new file
    $outputPath = "src\pages\movies\${name}MoviePage.tsx"
    Set-Content -Path $outputPath -Value $content
    
    Write-Host "✅ Created $outputPath"
}

Write-Host "`n✨ All movie pages created successfully!"
