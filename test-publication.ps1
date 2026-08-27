$ErrorActionPreference = 'Stop'
$websiteRoot = $PSScriptRoot
$testPath = Join-Path $websiteRoot 'publication\test-publisher.mjs'

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
	throw 'Node.js is required to test the notes publisher, but no executable was found.'
}

& $nodePath $testPath
if ($LASTEXITCODE -ne 0) { throw 'The notes-publication regression tests failed.' }
