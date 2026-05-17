$envContent = Get-Content ".env" -Raw -Encoding UTF8
$deployerKey = $null

if ($envContent -match "DEPLOYER_PRIVATE_KEY_ENC=(.+?)\r?\n") {
    $encrypted = $Matches[1].Trim()
    try {
        $secure = ConvertTo-SecureString $encrypted
        $ptr = [System.Runtime.InteropServices.Marshal]::SecureStringToGlobalAllocUnicode($secure)
        $deployerKey = [System.Runtime.InteropServices.Marshal]::PtrToStringUni($ptr)
        [System.Runtime.InteropServices.Marshal]::ZeroFreeGlobalAllocUnicode($ptr)
        Write-Host "[OK] Key decrypted" -ForegroundColor Green
    } catch {
        Write-Host "[FAIL] Cannot decrypt key" -ForegroundColor Red
        exit 1
    }
}

if (-not $deployerKey) {
    Write-Host "No key found" -ForegroundColor Red
    exit 1
}

$env:DEPLOYER_PRIVATE_KEY = $deployerKey
Write-Host "Deploying LaunchDAO to BSC Testnet..." -ForegroundColor Yellow
npx hardhat run scripts/deploy-dao-only.ts --network bscTestnet
