$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  DogePad - Build and Deploy Website" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

if (-not (Test-Path ".env")) {
    Write-Host "[ERROR] .env not found" -ForegroundColor Red
    Write-Host "Run deploy-contracts.bat first" -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}

$envContent = Get-Content ".env" -Raw -Encoding UTF8
$hasTestnet = $envContent -match "VITE_TESTNET_LAUNCH_DAO_ADDRESS=0x[a-fA-F0-9]{40}"
$hasMainnet = $envContent -match "VITE_MAINNET_LAUNCH_DAO_ADDRESS=0x[a-fA-F0-9]{40}"

if (-not $hasTestnet -and -not $hasMainnet) {
    Write-Host "[WARNING] No contract addresses found in .env" -ForegroundColor Yellow
    Write-Host "Website will build but cannot interact with contracts" -ForegroundColor Yellow
    Write-Host "Run deploy-contracts.bat first" -ForegroundColor White
    Write-Host ""
    $continue = Read-Host "Continue anyway? (y/n)"
    if ($continue -ne "y") { exit 0 }
}

if (-not (Test-Path "node_modules")) {
    Write-Host "Installing dependencies..." -ForegroundColor Yellow
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] npm install failed!" -ForegroundColor Red
        Read-Host "Press Enter to exit"
        exit 1
    }
}

Write-Host ""
Write-Host "Building website..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Build failed!" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Build successful!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Output: dist/" -ForegroundColor White
Write-Host ""

Write-Host "Deploy options:" -ForegroundColor Yellow
Write-Host "  1. Push to GitHub (auto deploy to GitHub Pages)" -ForegroundColor White
Write-Host "  2. Build only (deploy dist/ manually)" -ForegroundColor White
Write-Host ""
$choice = Read-Host "Enter (1/2)"

if ($choice -eq "1") {
    if (-not (Test-Path ".git")) {
        Write-Host "[ERROR] Not a git repository" -ForegroundColor Red
        Write-Host "Run: git init; git remote add origin <repo-url>" -ForegroundColor Yellow
        Read-Host "Press Enter to exit"
        exit 1
    }

    Write-Host ""
    Write-Host "Changes:" -ForegroundColor Yellow
    git status --short
    Write-Host ""

    $msg = Read-Host "Commit message (leave empty for auto)"
    if (-not $msg) { $msg = "update website $(Get-Date -Format 'yyyy-MM-dd HH:mm')" }

    git add -A
    git commit -m $msg
    git push origin main

    Write-Host ""
    Write-Host "Pushed! GitHub Actions will deploy to GitHub Pages" -ForegroundColor Green
    Write-Host "Check: GitHub repo -> Actions tab" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "[IMPORTANT] Make sure GitHub Settings -> Secrets has:" -ForegroundColor Yellow
    Write-Host "  VITE_WALLETCONNECT_PROJECT_ID" -ForegroundColor White
    Write-Host "  VITE_PINATA_JWT" -ForegroundColor White
    Write-Host "  VITE_TESTNET_LAUNCH_DAO_ADDRESS (and other contract addresses)" -ForegroundColor White
    Write-Host "  VITE_CHAIN_ID" -ForegroundColor White
} else {
    Write-Host ""
    Write-Host "dist/ is ready. Deploy to any static host:" -ForegroundColor Green
    Write-Host ""
    Write-Host "  GitHub Pages: push dist/ to gh-pages branch" -ForegroundColor White
    Write-Host "  Vercel:       connect GitHub repo" -ForegroundColor White
    Write-Host "  Netlify:      drag and drop dist/ folder" -ForegroundColor White
    Write-Host "  Self-hosted:  copy dist/ to Nginx/Apache" -ForegroundColor White
    Write-Host ""
    Write-Host "[NOTE] If you redeploy contracts, run this script again" -ForegroundColor Yellow
}

Write-Host ""
Read-Host "Press Enter to exit"
