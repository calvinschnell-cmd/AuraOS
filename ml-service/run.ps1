# Start the segmentation sidecar on http://127.0.0.1:8001 (ML_HOST / ML_PORT to override).
$py = Join-Path $PSScriptRoot ".venv\Scripts\python.exe"
if (-not (Test-Path $py)) { throw "ml-service\.venv missing. Run: npm run ml:setup" }
& $py (Join-Path $PSScriptRoot "server.py")
