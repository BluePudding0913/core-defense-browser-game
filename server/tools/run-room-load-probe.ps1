param([int]$Rooms = 4, [int]$Enemies = 200, [int]$Seconds = 12, [string]$BaselineRef = '', [double]$Speed = 0)
$ErrorActionPreference = 'Stop'
Push-Location (Split-Path $PSScriptRoot -Parent)
try {
    [xml]$report = Get-Content 'target/surefire-reports/TEST-example.WasdServerTest.xml'
    $probeClasspath = ($report.testsuite.properties.property | Where-Object name -eq 'java.class.path').value
    $probeJavaHome = ($report.testsuite.properties.property | Where-Object name -eq 'java.home').value
    New-Item -ItemType Directory -Force 'target/performance-probe' | Out-Null
    & "$probeJavaHome/bin/javac.exe" -encoding UTF-8 -cp $probeClasspath -d 'target/performance-probe' 'tools/RoomLoadProbe.java'
    if ($LASTEXITCODE -ne 0) { throw 'Probe compilation failed.' }
    $probeRuntimeClasspath = "target/performance-probe;$probeClasspath"
    if ($BaselineRef) {
        # Compile old sources into ignored output; never switch or modify a checkout.
        $probeRef = git rev-parse --verify "$BaselineRef^{commit}"
        if ($LASTEXITCODE -ne 0) { throw 'Invalid baseline commit.' }
        $probeBaselineDirectory = "target/performance-baseline/$probeRef"
        New-Item -ItemType Directory -Force "$probeBaselineDirectory/src", "$probeBaselineDirectory/classes" | Out-Null
        $probeFiles = git ls-tree -r --name-only $probeRef -- src/main/java
        # Git paths are relative to this server directory here.
        foreach ($probeFile in $probeFiles) {
            $probeName = Split-Path $probeFile -Leaf
            $probeContent = git show "${probeRef}:server/$probeFile"
            if ($LASTEXITCODE -ne 0) { throw 'Could not read baseline source.' }
            [IO.File]::WriteAllLines((Join-Path (Get-Location) "$probeBaselineDirectory/src/$probeName"), $probeContent, [Text.UTF8Encoding]::new($false))
        }
        $probeSources = Get-ChildItem "$probeBaselineDirectory/src/*.java" | Select-Object -ExpandProperty FullName
        & "$probeJavaHome/bin/javac.exe" -encoding UTF-8 -cp $probeClasspath -d "$probeBaselineDirectory/classes" $probeSources
        if ($LASTEXITCODE -ne 0) { throw 'Baseline compilation failed.' }
        $probeMap = git show "${probeRef}:shared/map.json"
        if ($LASTEXITCODE -ne 0) { throw 'Could not read baseline map.' }
        [IO.File]::WriteAllLines((Join-Path (Get-Location) "$probeBaselineDirectory/classes/map.json"), $probeMap, [Text.UTF8Encoding]::new($false))
        $probeRuntimeClasspath = "$probeBaselineDirectory/classes;$probeRuntimeClasspath"
    }
    & "$probeJavaHome/bin/java.exe" -Xmx512m -cp $probeRuntimeClasspath example.RoomLoadProbe $Rooms $Enemies $Seconds $Speed
    if ($LASTEXITCODE -ne 0) { throw 'Probe failed.' }
} finally { Pop-Location }
