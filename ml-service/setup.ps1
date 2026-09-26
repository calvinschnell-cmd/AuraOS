# AURA OS segmentation sidecar setup (Windows). Idempotent: checks what is
# already present and only installs what is missing. Run from the repo root:
#   npm run ml:setup
# or
#   powershell -ExecutionPolicy Bypass -File ml-service\setup.ps1

$ErrorActionPreference = "Stop"
$here = $PSScriptRoot
$venv = Join-Path $here ".venv"
$py = Join-Path $venv "Scripts\python.exe"
$torchIndex = "https://download.pytorch.org/whl/cu128"   # cu128+ needed for RTX 50-series (sm_120)

function Step($msg) { Write-Host "`n== $msg" -ForegroundColor Cyan }
function Found($msg) { Write-Host "   present: $msg" -ForegroundColor Green }
function Installing($msg) { Write-Host "   installing: $msg" -ForegroundColor Yellow }

Step "NVIDIA driver"
if (-not (Get-Command nvidia-smi -ErrorAction SilentlyContinue)) {
  throw "nvidia-smi not found. Install the latest NVIDIA Game Ready / Studio driver, reboot, and rerun."
}
Found (& nvidia-smi --query-gpu=name,driver_version --format=csv,noheader)

Step "Python (3.11 preferred, 3.10-3.13 ok)"
$base = $null
foreach ($v in "3.11", "3.12", "3.13", "3.10") {
  & py "-$v" -c "import sys" 2>$null
  if ($LASTEXITCODE -eq 0) { $base = $v; break }
}
if (-not $base) {
  throw "No Python 3.10-3.13 found via the py launcher. Install it with: winget install Python.Python.3.11  (then open a new terminal and rerun)"
}
Found "Python $base"

Step "Virtual env (ml-service\.venv)"
if (Test-Path $py) {
  Found (& $py --version)
} else {
  Installing "venv with Python $base"
  & py "-$base" -m venv $venv
  & $py -m pip install --upgrade pip --quiet
}

Step "PyTorch with CUDA"
$torchState = & $py -c "import torch, torchvision; print('cuda' if torch.cuda.is_available() else 'cpu')" 2>$null
if ($torchState -eq "cuda") {
  Found (& $py -c "import torch, torchvision; print(f'torch {torch.__version__}, torchvision {torchvision.__version__}, {torch.cuda.get_device_name(0)}')")
} else {
  if ($torchState -eq "cpu") { Write-Host "   CPU-only torch in the venv: replacing with the CUDA build" -ForegroundColor Yellow }
  Installing "torch + torchvision from $torchIndex (~3 GB)"
  & $py -m pip install --force-reinstall torch torchvision --index-url $torchIndex
}

Step "Service requirements"
& $py -m pip install -r (Join-Path $here "requirements.txt") --quiet
Found "transformers, fastapi, uvicorn, python-multipart, pillow"

Step "Verify"
& $py -c "import torch; assert torch.cuda.is_available(), 'CUDA still unavailable'; cap = 'sm_%d%d' % torch.cuda.get_device_capability(0); assert cap in torch.cuda.get_arch_list(), cap + ' not in this torch build'; print('   OK:', torch.cuda.get_device_name(0), cap, 'torch', torch.__version__)"
if ($LASTEXITCODE -ne 0) { throw "Verification failed (see above)." }
Write-Host "`nDone. Start the sidecar with: npm run ml" -ForegroundColor Cyan
