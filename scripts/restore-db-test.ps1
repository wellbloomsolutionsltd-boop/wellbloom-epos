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

createdb `
    $TestDatabase

pg_restore `
    -d $TestDatabase `
    $BackupFile

Write-Host `
    "Restore completed into $TestDatabase"
