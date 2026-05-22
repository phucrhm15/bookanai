# Copies Circle wallet integration from temp patch into d:\bookanai-main
# Run from elevated PowerShell if you get "Access denied" on D:\bookanai-main
param(
  [string]$TargetRoot = "d:\bookanai-main",
  [string]$PatchRoot = "$env:TEMP\bookanai-circle-patch"
)

$ErrorActionPreference = "Stop"
if (-not (Test-Path $PatchRoot)) {
  Write-Error "Patch not found: $PatchRoot"
}

Write-Host "Copying patch from $PatchRoot to $TargetRoot ..."
Copy-Item -Path (Join-Path $PatchRoot "*") -Destination $TargetRoot -Recurse -Force

$pkgPath = Join-Path $TargetRoot "package.json"
$pkg = Get-Content $pkgPath -Raw | ConvertFrom-Json
$add = @{
  "@circle-fin/developer-controlled-wallets" = "^9.0.0"
  "@circle-fin/x402-batching" = "^3.0.4"
  "@x402/core" = "^2.3.0"
  "@x402/evm" = "^2.3.0"
  "viem" = "^2.31.0"
}
foreach ($kv in $add.GetEnumerator()) {
  if (-not $pkg.dependencies.PSObject.Properties.Name.Contains($kv.Key)) {
    $pkg.dependencies | Add-Member -NotePropertyName $kv.Key -NotePropertyValue $kv.Value -Force
  }
}
$pkg | ConvertTo-Json -Depth 10 | Set-Content $pkgPath -Encoding utf8

Write-Host "Done. Next:"
Write-Host "  1. Copy .env.local.example to .env.local and fill Circle secrets"
Write-Host "  2. npm install  (or bun install)"
Write-Host "  3. npm run dev    (regenerates routeTree.gen.ts for /api/wallet routes)"
