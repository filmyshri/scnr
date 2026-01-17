param(
  [Parameter(Mandatory = $true)]
  [string]$InputPath,
  [Parameter(Mandatory = $true)]
  [string]$OutputPath,
  [int]$Quality = 80,
  [switch]$Lossless
)

if (-Not (Get-Command caesiumclt -ErrorAction SilentlyContinue)) {
  Write-Host "caesiumclt not found in PATH."
  Write-Host "Install from https://saerasoft.com/caesiumclt/ and reopen the terminal."
  exit 1
}

if (-Not (Test-Path $InputPath)) {
  Write-Host "Input path not found: $InputPath"
  exit 1
}

New-Item -ItemType Directory -Path $OutputPath -Force | Out-Null

$inputResolved = (Resolve-Path $InputPath).Path
$outputResolved = (Resolve-Path $OutputPath).Path

if ($Lossless) {
  caesiumclt --lossless -e --keep-dates -o $outputResolved $inputResolved
} else {
  caesiumclt -q $Quality -e --keep-dates -o $outputResolved $inputResolved
}

Write-Host "Compression finished. Output: $outputResolved"
