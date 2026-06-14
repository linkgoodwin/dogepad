# DogePad - One-Click Deploy & Push Script
# Usage: .\deploy-all.ps1

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  DogePad - Deploy & Push to Arc" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# Step 1: Compile contracts
Write-Host "`n[1/4] Compiling contracts..." -ForegroundColor Yellow
pnpm exec hardhat compile
if ($LASTEXITCODE -ne 0) { throw "Contract compilation failed" }

# Step 2: Deploy to Arc Testnet
Write-Host "`n[2/4] Deploying to Arc Testnet..." -ForegroundColor Yellow
node scripts/deploy-all.cjs
if ($LASTEXITCODE -ne 0) { throw "Deployment failed" }

# Step 3: Build frontend
Write-Host "`n[3/4] Building frontend..." -ForegroundColor Yellow
# Note: esbuild Windows temp file bug workaround - use esbuild: false in vite.config.ts for now
pnpm build
if ($LASTEXITCODE -ne 0) { throw "Build failed" }

# Step 4: Push to server (if configured)
Write-Host "`n[4/4] Pushing to server..." -ForegroundColor Yellow
if (Test-Path "deploy/scripts/deploy.sh") {
    Write-Host "Server deployment script found at deploy/scripts/deploy.sh"
    Write-Host "Run it manually on your server: bash deploy/scripts/deploy.sh"
} else {
    Write-Host "No server deployment script found. dist/ directory is ready."
}

Write-Host "`n========================================" -ForegroundColor Green
Write-Host "  All done!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
