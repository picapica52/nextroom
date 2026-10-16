# Nextroom のセットアップ（初回のみ）
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

bun install

bun run build

Write-Host "セットアップ完了。.\start.ps1 で起動し、http://127.0.0.1:8767 を開いてください。"
