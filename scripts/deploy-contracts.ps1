param(
    [ValidateSet("bscTestnet", "bscMainnet", "arcTestnet")]
    [string]$Network
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  DogePad - Deploy Contracts" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

if (-not (Test-Path ".env")) {
    Write-Host "[ERROR] .env not found" -ForegroundColor Red
    Write-Host "Run: copy .env.example .env" -ForegroundColor Yellow
    Write-Host "Then edit .env and fill in DEPLOYER_PRIVATE_KEY" -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}

$envContent = Get-Content ".env" -Raw -Encoding UTF8

$deployerKey = $null

if ($envContent -match "DEPLOYER_PRIVATE_KEY_ENC=(.+?)\r?\n") {
    $encrypted = $Matches[1].Trim()
    try {
        $secure = ConvertTo-SecureString $encrypted
        $ptr = [System.Runtime.InteropServices.Marshal]::SecureStringToGlobalAllocUnicode($secure)
        $deployerKey = [System.Runtime.InteropServices.Marshal]::PtrToStringUni($ptr)
        [System.Runtime.InteropServices.Marshal]::ZeroFreeGlobalAllocUnicode($ptr)
        Write-Host "[OK] Decrypted private key from .env" -ForegroundColor Green
    } catch {
        Write-Host "[WARNING] Cannot decrypt key from .env (wrong user or machine?)" -ForegroundColor Yellow
    }
}

if (-not $deployerKey -and $envContent -match "DEPLOYER_PRIVATE_KEY\s*=\s*((0x)?[a-fA-F0-9]{64})") {
    $deployerKey = $Matches[1]
    Write-Host "[OK] Using plain text private key from .env" -ForegroundColor Yellow
    Write-Host "  Tip: Run .\scripts\key-manager.ps1 -Encrypt for better security" -ForegroundColor DarkGray
}

if (-not $deployerKey) {
    Write-Host ""
    Write-Host "DEPLOYER_PRIVATE_KEY not found in .env" -ForegroundColor Yellow
    Write-Host "You can enter it now (will NOT be saved to disk):" -ForegroundColor Yellow
    Write-Host ""
    $keyInput = Read-Host "Private key (0x + 64 hex chars)"
    if ($keyInput -match "^(0x)?[a-fA-F0-9]{64}$") {
        $deployerKey = $keyInput
    } else {
        Write-Host "[ERROR] Invalid private key format" -ForegroundColor Red
        Read-Host "Press Enter to exit"
        exit 1
    }
}

$env:DEPLOYER_PRIVATE_KEY = $deployerKey

if (-not $Network) {
    Write-Host "Select network:"
    Write-Host "  1. BSC Testnet (bscTestnet)"
    Write-Host "  2. BSC Mainnet (bscMainnet)"
    Write-Host "  3. Arc Testnet (arcTestnet)"
    Write-Host ""
    $choice = Read-Host "Enter (1/2/3)"

    if ($choice -eq "1") {
        $Network = "bscTestnet"
    } elseif ($choice -eq "2") {
        $Network = "bscMainnet"
    } elseif ($choice -eq "3") {
        $Network = "arcTestnet"
    } else {
        Write-Host "Invalid choice" -ForegroundColor Red
        Read-Host "Press Enter to exit"
        exit 1
    }
}

if ($Network -eq "bscTestnet") {
    Write-Host ""
    Write-Host "[INFO] Testnet needs ~0.05 BNB for gas" -ForegroundColor Yellow
    Write-Host "  Faucet: https://testnet.bnbchain.org/faucet-smart" -ForegroundColor White
} elseif ($Network -eq "arcTestnet") {
    Write-Host ""
    Write-Host "[INFO] Arc Testnet needs ~0.05 USDC for gas" -ForegroundColor Yellow
    Write-Host "  Faucet: https://faucet.circle.com" -ForegroundColor White
} else {
    Write-Host ""
    Write-Host "[WARNING] Mainnet needs ~0.5 BNB for gas!" -ForegroundColor Red
    $confirm = Read-Host "Type yes to continue"
    if ($confirm -ne "yes") {
        Write-Host "Cancelled" -ForegroundColor Yellow
        Read-Host "Press Enter to exit"
        exit 0
    }
}

Write-Host ""
Write-Host "Target: $Network" -ForegroundColor Green
Write-Host ""

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
Write-Host "Compiling contracts..." -ForegroundColor Yellow
npx hardhat compile
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Compilation failed!" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}
Write-Host "Compiled OK!" -ForegroundColor Green
Write-Host ""

Write-Host "Deploying to $Network ..." -ForegroundColor Yellow
Write-Host "----------------------------------------" -ForegroundColor DarkGray
npx hardhat run scripts/deploy.ts --network $Network
if ($LASTEXITCODE -ne 0) {
    Write-Host "----------------------------------------" -ForegroundColor DarkGray
    Write-Host "[ERROR] Deployment failed!" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}
Write-Host "----------------------------------------" -ForegroundColor DarkGray
Write-Host ""

Write-Host "========================================" -ForegroundColor Green
Write-Host "  Contracts deployed successfully!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Network: $Network" -ForegroundColor White
Write-Host "  Addresses saved to: .env" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next: Run deploy-web.bat to build and upload website" -ForegroundColor Yellow
Write-Host ""

Read-Host "Press Enter to exit"
