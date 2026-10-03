@echo off
setlocal EnableExtensions
title CORE DEFENSE - Run Existing JAR
cd /d "%~dp0"

echo [1/4] Checking Java...
where java >nul 2>nul
if errorlevel 1 goto java_missing
where jwebserver >nul 2>nul
if errorlevel 1 goto java_missing

if not exist "server\target\core-defense-server.jar" goto jar_missing

echo [2/4] Stopping previous test servers...
taskkill /FI "WINDOWTITLE eq CORE DEFENSE Server*" /T /F >nul 2>nul
taskkill /FI "WINDOWTITLE eq CORE DEFENSE Web*" /T /F >nul 2>nul
ping 127.0.0.1 -n 2 >nul

echo [3/4] Starting existing game server JAR...
start "CORE DEFENSE Server" /D "%~dp0server" cmd /k java -jar target\core-defense-server.jar

echo [4/4] Starting browser client...
start "CORE DEFENSE Web" /D "%~dp0" cmd /k jwebserver -d "%~dp0" -p 8080

echo.
echo Existing JAR started without building.
echo Open http://localhost:8080/client/ when you want to play.
echo Close the two command windows to stop the servers.
timeout /t 3 /nobreak >nul
exit /b 0

:jar_missing
echo.
echo Existing JAR was not found:
echo   server\target\core-defense-server.jar
echo Run test-build-and-run.bat once to build it.
pause
exit /b 1

:java_missing
echo.
echo JDK 17 or newer is required. Install a JDK and try again.
pause
exit /b 1
