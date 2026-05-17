param(
    [switch]$Encrypt,
    [switch]$Decrypt,
    [switch]$Show
)

$envPath = ".env"

if ($Encrypt) {
    Write-Host ""
    Write-Host "Encrypt private key (Windows DPAPI)" -ForegroundColor Cyan
    Write-Host "  Encrypted key can ONLY be decrypted on this PC, by this Windows user" -ForegroundColor DarkGray
    Write-Host ""

    $key = $null

    if (Test-Path $envPath) {
        $content = Get-Content $envPath -Raw -Encoding UTF8
        if ($content -match "DEPLOYER_PRIVATE_KEY\s*=\s*(0x)?[a-fA-F0-9]{64}") {
            $key = $Matches[1]
            Write-Host "[OK] Found plain text key in .env" -ForegroundColor Green
        }
    }

    if (-not $key) {
        Write-Host "No plain text key found in .env" -ForegroundColor Yellow
        $key = Read-Host "Paste your private key (0x + 64 hex chars)"
    }

    if ($key -notmatch "^(0x)?[a-fA-F0-9]{64}$") {
        Write-Host "[ERROR] Invalid private key format" -ForegroundColor Red
        Read-Host "Press Enter to exit"
        exit 1
    }

    $secure = ConvertTo-SecureString $key -AsPlainText -Force
    $encrypted = ConvertFrom-SecureString $secure

    if (Test-Path $envPath) {
        $content = Get-Content $envPath -Raw
        if ($content -match "DEPLOYER_PRIVATE_KEY_ENC=") {
            $content = $content -replace "DEPLOYER_PRIVATE_KEY_ENC=.*", "DEPLOYER_PRIVATE_KEY_ENC=$encrypted"
        } else {
            $content += "`nDEPLOYER_PRIVATE_KEY_ENC=$encrypted`n"
        }

        if ($content -match "DEPLOYER_PRIVATE_KEY\s*=\s*(0x)?[a-fA-F0-9]{64}") {
            $content = $content -replace "DEPLOYER_PRIVATE_KEY\s*=\s*(0x)?[a-fA-F0-9]{64}\r?\n?", ""
            Write-Host "[OK] Plain text key removed from .env" -ForegroundColor Green
        }

        Set-Content $envPath $content -NoNewline -Encoding UTF8
    } else {
        Set-Content $envPath "DEPLOYER_PRIVATE_KEY_ENC=$encrypted`n" -NoNewline -Encoding UTF8
    }

    Write-Host ""
    Write-Host "Done! Private key encrypted and saved to .env" -ForegroundColor Green
    Write-Host "  Plain text key has been removed" -ForegroundColor Green
    Write-Host "  Only this Windows user on this PC can decrypt it" -ForegroundColor Cyan
    Write-Host ""

} elseif ($Decrypt) {
    if (-not (Test-Path $envPath)) { Write-Host "[ERROR] .env not found" -ForegroundColor Red; Read-Host "Press Enter to exit"; exit 1 }
    $content = Get-Content $envPath -Raw
    if ($content -match "DEPLOYER_PRIVATE_KEY_ENC=(.+)") {
        $encrypted = $Matches[1].Trim()
        try {
            $secure = ConvertTo-SecureString $encrypted
            $ptr = [System.Runtime.InteropServices.Marshal]::SecureStringToGlobalAllocUnicode($secure)
            $decrypted = [System.Runtime.InteropServices.Marshal]::PtrToStringUni($ptr)
            [System.Runtime.InteropServices.Marshal]::ZeroFreeGlobalAllocUnicode($ptr)
            Write-Host ""
            Write-Host "Decrypted key: $decrypted" -ForegroundColor Yellow
            Write-Host "(showing for verification only)" -ForegroundColor DarkGray
            Write-Host ""
        } catch {
            Write-Host "[ERROR] Cannot decrypt. Are you the same Windows user who encrypted it?" -ForegroundColor Red
        }
    } else {
        Write-Host "[ERROR] No encrypted key found in .env" -ForegroundColor Red
    }

} elseif ($Show) {
    if (-not (Test-Path $envPath)) { Write-Host "[ERROR] .env not found" -ForegroundColor Red; Read-Host "Press Enter to exit"; exit 1 }
    $content = Get-Content $envPath -Raw
    $hasPlain = $content -match "DEPLOYER_PRIVATE_KEY\s*=\s*0x?[a-fA-F0-9]{64}"
    $hasEnc = $content -match "DEPLOYER_PRIVATE_KEY_ENC="

    Write-Host ""
    Write-Host "Key status in .env:" -ForegroundColor Cyan
    Write-Host "  Plain text key: $(if ($hasPlain) { 'EXISTS (not secure)' } else { 'not found' })" -ForegroundColor $(if ($hasPlain) { 'Yellow' } else { 'Green' })
    Write-Host "  Encrypted key:  $(if ($hasEnc) { 'EXISTS (secure)' } else { 'not found' })" -ForegroundColor $(if ($hasEnc) { 'Green' } else { 'Yellow' })
    Write-Host ""

} else {
    Write-Host ""
    Write-Host "Usage:" -ForegroundColor Cyan
    Write-Host "  .\scripts\key-manager.ps1 -Encrypt   Encrypt key from .env (auto-remove plain text)" -ForegroundColor White
    Write-Host "  .\scripts\key-manager.ps1 -Decrypt   Verify encrypted key" -ForegroundColor White
    Write-Host "  .\scripts\key-manager.ps1 -Show      Check key status" -ForegroundColor White
    Write-Host ""
    Write-Host "Security: Windows DPAPI (tied to current user + machine)" -ForegroundColor DarkGray
    Write-Host ""
}

Read-Host "Press Enter to exit"
