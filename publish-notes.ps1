param(
	[string]$WorkId = 'topos-theory',
	[switch]$CheckOnly
)

$ErrorActionPreference = 'Stop'
$websiteRoot = $PSScriptRoot
$publisherPath = Join-Path $websiteRoot 'publication\publish-notes.mjs'
$configPath = Join-Path $websiteRoot "publication\works\$WorkId.json"

if (-not (Test-Path -LiteralPath $configPath)) {
	throw "No publication configuration exists for work ID $WorkId."
}

$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
if ($null -ne $nodeCommand) {
	$nodePath = $nodeCommand.Source
} else {
	$codexNodeRoot = Join-Path $env:LOCALAPPDATA 'OpenAI\Codex\runtimes\cua_node'
	$nodePath = Get-ChildItem -LiteralPath $codexNodeRoot -Filter node.exe -Recurse -ErrorAction SilentlyContinue |
		Sort-Object LastWriteTime -Descending |
		Select-Object -First 1 -ExpandProperty FullName
}
if ([string]::IsNullOrWhiteSpace($nodePath)) {
	throw 'Node.js is required to publish the generated notes, but no executable was found.'
}

$arguments = @($publisherPath, $configPath)
if ($CheckOnly) { $arguments += '--check' }
& $nodePath @arguments
if ($LASTEXITCODE -ne 0) { throw "Publication failed for $WorkId." }
