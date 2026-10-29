$ErrorActionPreference = 'Stop'

Write-Host "== Multi-Tenant Workflow Engine setup ==" -ForegroundColor Cyan
if (-not (Test-Path ".\package.json")) {
  throw "Open PowerShell in the project folder containing package.json. Current folder: $(Get-Location)"
}

$nodeVersion = (node -v).TrimStart('v')
$major = [int]($nodeVersion.Split('.')[0])
$minor = [int]($nodeVersion.Split('.')[1])
if ($major -lt 22 -or ($major -eq 22 -and $minor -lt 12)) {
  Write-Warning "Recommended Node.js is 22.12 or newer. Current version: $nodeVersion"
}

if (-not (Test-Path ".\.env")) {
  Copy-Item ".\.env.example" ".\.env"
  Write-Host "Created .env from .env.example" -ForegroundColor Green
}

Write-Host "Installing npm packages..." -ForegroundColor Cyan
npm install
if ($LASTEXITCODE -ne 0) { throw "npm install failed. Read the npm error above." }

Write-Host "Starting frontend + backend on http://localhost:3000 ..." -ForegroundColor Green
npm run dev
