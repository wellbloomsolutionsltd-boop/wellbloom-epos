param(
    [Parameter(Mandatory = $true)]
    [string]$BackupFile,

    [string]$TestDatabase =
        "wellbloom_pos_restore_test"
)

$ErrorActionPreference =
    "Stop"

dropdb `
    --if-exists `
    $TestDatabase

if ($LASTEXITCODE -ne 0) {
    throw "Could not prepare restore database (dropdb exit code $LASTEXITCODE)"
}

createdb `
    $TestDatabase

if ($LASTEXITCODE -ne 0) {
    throw "Could not create restore database (createdb exit code $LASTEXITCODE)"
}

pg_restore `
    -d $TestDatabase `
    $BackupFile

if ($LASTEXITCODE -ne 0) {
    throw "Database restore failed with exit code $LASTEXITCODE"
}

Write-Host `
    "Restore completed into $TestDatabase"
