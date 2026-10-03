@echo off
setlocal EnableExtensions
title CORE DEFENSE - Test Build
cd /d "%~dp0"

echo [1/5] Checking Java...
where java >nul 2>nul
if errorlevel 1 goto java_missing
where jwebserver >nul 2>nul
if errorlevel 1 goto java_missing

echo [2/5] Stopping previous test servers...
taskkill /FI "WINDOWTITLE eq CORE DEFENSE Server*" /T /F >nul 2>nul
taskkill /FI "WINDOWTITLE eq CORE DEFENSE Web*" /T /F >nul 2>nul
ping 127.0.0.1 -n 2 >nul

echo [3/5] Building game server...
pushd server
call mvnw.cmd clean package
if errorlevel 1 goto build_failed
popd

if /I "%~1"=="--build-only" goto build_only_done

echo [4/5] Starting game server...
start "CORE DEFENSE Server" /D "%~dp0server" cmd /k java -jar target\core-defense-server.jar

echo [5/5] Starting browser client...
start "CORE DEFENSE Web" /D "%~dp0" cmd /k jwebserver -d "%~dp0" -p 8080
timeout /t 2 /nobreak >nul
start "" "http://localhost:8080/client/"

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
echo If core-defense-server.jar is in use, close any old CORE DEFENSE or Java server window and retry.
pause
exit /b 1

:java_missing
echo.
echo JDK 17 or newer is required. Install a JDK and try again.
pause
exit /b 1
