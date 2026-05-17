@echo off
chcp 65001 >nul 2>&1
setlocal enabledelayedexpansion

echo ============================================
echo    DogePad - One-Click Start Script
echo ============================================
echo.

:: --------------------------------------------------
:: 1. Check and install Node.js
:: --------------------------------------------------
echo [1/5] Checking Node.js...

where node >nul 2>&1
if %errorlevel% equ 0 (
    for /f "tokens=*" %%v in ('node -v') do set NODE_VER=%%v
    echo [OK] Node.js !NODE_VER! found
    goto :node_ready
)

echo Node.js not found in PATH.
echo Checking common install locations...

set "NODE_FOUND="
for %%d in (
    "C:\Program Files\nodejs"
    "C:\Program Files (x86)\nodejs"
    "%LOCALAPPDATA%\fnm"
    "%USERPROFILE%\AppData\Roaming\nvm"
) do (
    if exist %%~d\node.exe (
        set "NODE_FOUND=%%~d"
        goto :node_found_in_dir
    )
)

:: Try fnm with multiple versions
if exist "%LOCALAPPDATA%\fnm" (
    for /d %%v in ("%LOCALAPPDATA%\fnm\node-versions\*") do (
        if exist "%%v\installation\node.exe" (
            set "NODE_FOUND=%%v\installation"
            goto :node_found_in_dir
        )
    )
)

goto :install_node

:node_found_in_dir
echo [OK] Node.js found at !NODE_FOUND!
set "PATH=!NODE_FOUND!;%PATH%"
goto :node_ready

:install_node
echo.
echo --------------------------------------------
echo  Node.js is not installed on this system.
echo  Choose an installation method:
echo.
echo  [1] Auto-install via winget (recommended^)
echo  [2] Auto-install via fnm (no admin needed^)
echo  [3] Open Node.js download page (manual^)
echo  [4] Skip - I will install it myself
echo --------------------------------------------
echo.
set /p INSTALL_CHOICE="Enter choice (1-4): "

if "!INSTALL_CHOICE!"=="1" goto :install_winget
if "!INSTALL_CHOICE!"=="2" goto :install_fnm
if "!INSTALL_CHOICE!"=="3" goto :install_manual
if "!INSTALL_CHOICE!"=="4" goto :install_skip
goto :install_node

:install_winget
echo.
echo Installing Node.js LTS via winget...
winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
if %errorlevel% neq 0 (
    echo [WARN] winget install failed, trying fnm instead...
    goto :install_fnm
)
echo [OK] Node.js installed via winget
set "PATH=C:\Program Files\nodejs;%PATH%"
:: Verify
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [INFO] Please close this window and run start.bat again
    echo        Node.js was installed but PATH needs a fresh terminal
    pause
    exit /b 0
)
goto :node_ready

:install_fnm
echo.
echo Installing fnm (Fast Node Manager^)...
set "FNM_DIR=%LOCALAPPDATA%\fnm"
set "FNM_ZIP=%TEMP%\fnm-windows.zip"

powershell -NoProfile -Command "Invoke-WebRequest -Uri 'https://github.com/Schniz/fnm/releases/latest/download/fnm-windows.zip' -OutFile '%FNM_ZIP%'" 2>nul
if not exist "%FNM_ZIP%" (
    echo [ERROR] Failed to download fnm
    echo         Please install Node.js manually from https://nodejs.org/
    pause
    exit /b 1
)

if not exist "%FNM_DIR%" mkdir "%FNM_DIR%"
powershell -NoProfile -Command "Expand-Archive -Path '%FNM_ZIP%' -DestinationPath '%FNM_DIR%' -Force"
del "%FNM_ZIP%" 2>nul

echo Installing Node.js LTS via fnm...
"%FNM_DIR%\fnm.exe" install --lts
if %errorlevel% neq 0 (
    echo [ERROR] fnm install failed
    pause
    exit /b 1
)

for /f "tokens=*" %%p in ('"%FNM_DIR%\fnm.exe" exec --lts -- node -e "process.stdout.write(process.execPath)"') do set "NODE_PATH=%%p"
for %%p in ("!NODE_PATH!") do set "NODE_DIR=%%~dp"
set "PATH=!NODE_DIR!;%PATH%"

echo [OK] Node.js installed via fnm
goto :node_ready

:install_manual
echo.
echo Opening Node.js download page in your browser...
start https://nodejs.org/en/download/
echo.
echo After installing Node.js:
echo   1. Close this window
echo   2. Run start.bat again
pause
exit /b 0

:install_skip
echo.
echo Please install Node.js first, then run start.bat again.
pause
exit /b 0

:node_ready
:: Final verify
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js still not available. Please install manually.
    echo         Download from: https://nodejs.org/
    pause
    exit /b 1
)

for /f "tokens=*" %%v in ('node -v') do set NODE_VER=%%v
echo [OK] Node.js !NODE_VER! ready

:: --------------------------------------------------
:: 2. Check npm
:: --------------------------------------------------
echo [2/5] Checking npm...
where npm >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] npm not found! Node.js may be incomplete.
    echo         Please reinstall Node.js from https://nodejs.org/
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('npm -v') do set NPM_VER=%%v
echo [OK] npm !NPM_VER! found

:: --------------------------------------------------
:: 3. Install dependencies
:: --------------------------------------------------
echo [3/5] Checking dependencies...
if not exist "node_modules" (
    echo Installing dependencies (first time, may take a few minutes^)...
    call npm install
    if %errorlevel% neq 0 (
        echo [ERROR] npm install failed!
        pause
        exit /b 1
    )
    echo [OK] Dependencies installed
) else (
    echo [OK] node_modules exists, skipping install
    echo       Run 'npm install' manually if you need to update
)

:: --------------------------------------------------
:: 4. Compile smart contracts
:: --------------------------------------------------
echo [4/5] Compiling smart contracts...
if not exist "artifacts\contracts\BondingCurve.sol\BondingCurve.json" (
    echo First-time compilation, this may take a while...
) else (
    echo Re-compiling contracts...
)

call npx hardhat compile
if %errorlevel% neq 0 (
    echo [WARN] Contract compilation failed, frontend will still start
    echo        Run 'npx hardhat compile' manually to check errors
) else (
    echo [OK] Smart contracts compiled
)

:: --------------------------------------------------
:: 5. Setup .env and start dev server
:: --------------------------------------------------
echo [5/5] Starting development server...

if not exist ".env" (
    if exist ".env.example" (
        echo Creating .env from .env.example...
        copy .env.example .env >nul
        echo [INFO] .env created with default values
        echo        Edit .env to add your WalletConnect ID and contract addresses
    ) else (
        echo [WARN] No .env.example found, creating minimal .env...
        (
            echo VITE_WALLETCONNECT_PROJECT_ID=
            echo VITE_BSC_RPC_URL=https://bsc-dataseed1.binance.org/
            echo VITE_CHAIN_ID=56
        ) > .env
    )
)

echo.
echo ============================================
echo    Starting DogePad Dev Server...
echo    Press Ctrl+C to stop
echo ============================================
echo.

call npm run dev

pause
