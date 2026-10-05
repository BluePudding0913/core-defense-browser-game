$ErrorActionPreference = 'Stop'
Push-Location (Split-Path $PSScriptRoot -Parent)
try {
    if (-not (Test-Path 'target/surefire-reports/TEST-example.WasdServerTest.xml')) {
        throw 'Run .\mvnw.cmd -o test in server first.'
    }
    [xml]$report = Get-Content 'target/surefire-reports/TEST-example.WasdServerTest.xml'
    $probeClasspath = ($report.testsuite.properties.property | Where-Object name -eq 'java.class.path').value
    $probeJavaHome = ($report.testsuite.properties.property | Where-Object name -eq 'java.home').value
    New-Item -ItemType Directory -Force 'target/performance-probe' | Out-Null
    & "$probeJavaHome/bin/javac.exe" -encoding UTF-8 -cp $probeClasspath -d 'target/performance-probe' 'tools/PathfindingProbe.java'
    if ($LASTEXITCODE -ne 0) { throw 'Probe compilation failed.' }
    & "$probeJavaHome/bin/java.exe" -cp "target/performance-probe;$probeClasspath" example.PathfindingProbe
    if ($LASTEXITCODE -ne 0) { throw 'Probe failed.' }
} finally {
    Pop-Location
}
