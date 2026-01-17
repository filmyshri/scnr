Write-Host "Creating virtual environment..."
if (-Not (Test-Path .venv)) {
  python -m venv .venv
}

$venvPython = ".\.venv\Scripts\python.exe"

Write-Host "Installing dependencies..."
& $venvPython -m pip install --upgrade pip "setuptools<81"

$cmakePath = "C:\Program Files\CMake\bin"
if (Test-Path $cmakePath) {
  $env:Path = "$cmakePath;$env:Path"
} else {
  Write-Host "CMake not found. Install CMake to build dlib."
}

& $venvPython -m pip install -r requirements.txt

Write-Host "Ensure you add JPG/PNG images to the .\database folder."
Write-Host "Starting the server at http://127.0.0.1:5000"
& $venvPython app.py
