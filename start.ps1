# Nextroom を起動する（サーバー、-Dev では画面の開発サーバーも）
#   .\start.ps1            ビルド済みの画面をサーバーから配信（http://127.0.0.1:8767、スマホからは https://<PC の IP>:8768）
#   .\start.ps1 -Dev       画面・サーバーをホットリロードで開発（https://127.0.0.1:5175）
param([switch]$Dev)
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

$task = 'start'
if ($Dev) {
    $task = 'dev'
    Write-Host '画面: https://127.0.0.1:5175（自己署名の証明書の警告を許可して開く）'
} else {
    if (-not (Test-Path "$PSScriptRoot\apps\web\dist\index.html")) {
        bun run build
    }
    Write-Host '画面: http://127.0.0.1:8767'
}

bun x turbo run $task
