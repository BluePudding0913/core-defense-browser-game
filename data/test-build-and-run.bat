@echo off
setlocal EnableExtensions
title CORE DEFENSE - Test Build
cd /d "%~dp0"

echo [1/4] Checking Java...
where java >nul 2>nul
if errorlevel 1 goto java_missing
where jwebserver >nul 2>nul
if errorlevel 1 goto java_missing

echo [2/4] Building game server...
pushd server
call mvnw.cmd clean package
if errorlevel 1 goto build_failed
popd

if /I "%~1"=="--build-only" goto build_only_done

echo [3/4] Starting game server...
start "CORE DEFENSE Server" /D "%~dp0server" cmd /k java -jar target\core-defense-server.jar

echo [4/4] Starting browser client...
start "CORE DEFENSE Web" /D "%~dp0client" cmd /k jwebserver -d . -p 8080
timeout /t 2 /nobreak >nul
start "" "http://localhost:8080"

echo.
echo Build complete. The test game is opening in your browser.
echo Close the two command windows to stop the test servers.
timeout /t 3 /nobreak >nul
exit /b 0

:build_only_done
echo.
echo Build complete: server\target\core-defense-server.jar
exit /b 0

:build_failed
popd
echo.
echo Build failed. Check the error messages above.
pause
exit /b 1

:java_missing
echo.
echo JDK 17 or newer is required. Install a JDK and try again.
pause
exit /b 1
