"""AURA OS garment segmentation sidecar.

Stage 1 of outfit analysis: runs sayeed99/segformer_b3_clothes on the GPU and
returns garment regions (label, box, area, dominant colors) plus a face box. The Next.js
analyze pipeline (lib/server/segmenter.ts) calls POST /segment on localhost and
falls back to image-only scoring if this service is down.

Run:  .venv\\Scripts\\python server.py   (or `npm run ml` from the repo root)
"""

import io
import logging
import os
import threading
import time
from contextlib import asynccontextmanager

import numpy as np
import torch
import torch.nn.functional as F
import uvicorn
from fastapi import FastAPI, File, HTTPException, UploadFile
from PIL import Image, UnidentifiedImageError
from transformers import AutoImageProcessor, AutoModelForSemanticSegmentation

MODEL_ID = os.environ.get("SEGFORMER_MODEL", "sayeed99/segformer_b3_clothes")
HOST = os.environ.get("ML_HOST", "127.0.0.1")
PORT = int(os.environ.get("ML_PORT", "8001"))

# Regions smaller than this share of the image are treated as noise.
MIN_GARMENT_AREA = 0.002
MIN_FACE_AREA = 0.0005
# Share of mask pixels trimmed from each edge so stray specks do not stretch a box.
BOX_TRIM = 0.01
# Palette: up to this many dominant colors per garment, each covering at least MIN_COLOR_SHARE of it.
MAX_PALETTE = 3
MIN_COLOR_SHARE = 0.08
# Clusters closer than this (RGB distance) are the same color under different light.
MERGE_COLOR_DIST = 28.0
PALETTE_SAMPLE = 4000

# Body parts are not garments; the face is returned separately.
NON_GARMENT = {"background", "hair", "face", "left-leg", "right-leg", "left-arm", "right-arm"}
MERGED = {"left-shoe": "Shoes", "right-shoe": "Shoes"}

log = logging.getLogger("uvicorn.error")
state: dict = {}
gpu_lock = threading.Lock()


def require_cuda() -> torch.device:
    """Both kiosk machines have NVIDIA GPUs: fail loudly instead of crawling on CPU."""
    if not torch.cuda.is_available():
        raise RuntimeError(
            f"CUDA is not available (torch {torch.__version__}, CUDA build {torch.version.cuda}). "
            "Install the CUDA wheel into this venv: "
            "pip install torch torchvision --index-url https://download.pytorch.org/whl/cu128"
        )
    major, minor = torch.cuda.get_device_capability(0)
    arch = f"sm_{major}{minor}"
    if arch not in torch.cuda.get_arch_list():
        raise RuntimeError(
            f"{torch.cuda.get_device_name(0)} is {arch}, which torch {torch.__version__} was not built for "
            f"(has {', '.join(torch.cuda.get_arch_list())}). RTX 50-series needs the cu128 or newer wheel."
        )
    return torch.device("cuda:0")


@asynccontextmanager
async def lifespan(_: FastAPI):
    device = require_cuda()
    name = torch.cuda.get_device_name(0)
    log.info("segmenter: torch %s, CUDA %s, device %s (%s)", torch.__version__, torch.version.cuda, device, name)
    t0 = time.perf_counter()
    processor = AutoImageProcessor.from_pretrained(MODEL_ID)
    model = AutoModelForSemanticSegmentation.from_pretrained(MODEL_ID).to(device).eval()
    state.update(processor=processor, model=model, device=device, device_name=name, id2label=model.config.id2label)
    run_segmentation(Image.new("RGB", (768, 1024)))  # warm up CUDA kernels before the first real scan
    log.info("segmenter: %s ready in %.1fs, labels: %s", MODEL_ID, time.perf_counter() - t0, ", ".join(state["id2label"].values()))
    yield
    state.clear()


app = FastAPI(title="AURA OS segmenter", lifespan=lifespan)


def robust_box(mask: torch.Tensor) -> list[int]:
    """[ymin, xmin, ymax, xmax] normalized 0-1000, trimming BOX_TRIM of pixels per edge."""
    h, w = mask.shape

    def span(profile: torch.Tensor) -> tuple[int, int]:
        c = torch.cumsum(profile.float(), 0)
        c = c / c[-1]
        bounds = torch.tensor([BOX_TRIM, 1 - BOX_TRIM], device=c.device)
        lo, hi = torch.searchsorted(c, bounds).tolist()
        return lo, min(hi + 1, len(profile))

    y0, y1 = span(mask.sum(dim=1))
    x0, x1 = span(mask.sum(dim=0))
    return [round(y0 / h * 1000), round(x0 / w * 1000), round(y1 / h * 1000), round(x1 / w * 1000)]


def dominant_colors(pixels: torch.Tensor) -> list[dict]:
    """k-means over one garment's pixels ((N, 3) float RGB): up to MAX_PALETTE colors with their share."""
    if pixels.shape[0] == 0:
        return []
    if pixels.shape[0] > PALETTE_SAMPLE:
        pixels = pixels[torch.linspace(0, pixels.shape[0] - 1, PALETTE_SAMPLE, device=pixels.device).long()]
    k = min(MAX_PALETTE, pixels.shape[0])
    # Deterministic init: pixels at evenly spaced brightness quantiles.
    lum = pixels @ torch.tensor([0.299, 0.587, 0.114], device=pixels.device)
    order = torch.argsort(lum)
    picks = torch.linspace(0, len(order) - 1, k + 2, device=pixels.device).long()[1:-1]
    centers = pixels[order[picks]].clone()
    for _ in range(8):
        assign = torch.cdist(pixels, centers).argmin(dim=1)
        for j in range(k):
            members = pixels[assign == j]
            if len(members):
                centers[j] = members.mean(dim=0)
    assign = torch.cdist(pixels, centers).argmin(dim=1)
    shares = torch.bincount(assign, minlength=k).float() / len(assign)

    merged: list[dict] = []
    for j in torch.argsort(shares, descending=True).tolist():
        for other in merged:
            if torch.dist(other["rgb"], centers[j]).item() < MERGE_COLOR_DIST:
                other["share"] += shares[j].item()
                break
        else:
            merged.append({"rgb": centers[j], "share": shares[j].item()})
    return [
        {"hex": "#%02x%02x%02x" % tuple(int(v) for v in c["rgb"].round().clamp(0, 255).tolist()), "share": round(c["share"], 3)}
        for c in merged
        if c["share"] >= MIN_COLOR_SHARE
    ]


def run_segmentation(image: Image.Image) -> dict:
    processor, model, device = state["processor"], state["model"], state["device"]
    w, h = image.size
    t0 = time.perf_counter()
    inputs = processor(images=image, return_tensors="pt").to(device)
    with gpu_lock, torch.inference_mode():
        with torch.autocast("cuda", dtype=torch.float16):
            logits = model(**inputs).logits
        labels = F.interpolate(logits.float(), size=(h, w), mode="bilinear", align_corners=False).argmax(dim=1)[0]
        rgb = torch.from_numpy(np.asarray(image, dtype=np.uint8).copy()).to(device).float()

        masks: dict[str, torch.Tensor] = {}
        for class_id in torch.unique(labels).tolist():
            name = state["id2label"][class_id]
            key = MERGED.get(name.lower(), name)
            if key.lower() in NON_GARMENT and key.lower() != "face":
                continue
            m = labels == class_id
            masks[key] = masks[key] | m if key in masks else m

        garments = []
        face_box = None
        for key, m in masks.items():
            area = m.sum().item() / (h * w)
            if key.lower() == "face":
                face_box = robust_box(m) if area >= MIN_FACE_AREA else None
            elif area >= MIN_GARMENT_AREA:
                garments.append({"label": key, "box_2d": robust_box(m), "area": round(area, 4), "colors": dominant_colors(rgb[m])})
        torch.cuda.synchronize()

    garments.sort(key=lambda g: g["box_2d"][0])
    return {"garments": garments, "face_box": face_box, "device": state["device_name"], "ms": (time.perf_counter() - t0) * 1000}


@app.get("/health")
def health() -> dict:
    return {"ok": bool(state), "model": MODEL_ID, "device": state.get("device_name")}


@app.post("/segment")
def segment(image: UploadFile = File(...)) -> dict:
    # Sync handler: FastAPI runs it in a worker thread; gpu_lock serializes the model.
    try:
        img = Image.open(io.BytesIO(image.file.read())).convert("RGB")
    except (UnidentifiedImageError, OSError) as err:
        raise HTTPException(status_code=400, detail=f"not an image: {err}") from err
    result = run_segmentation(img)
    summary = ", ".join(f'{g["label"]} {"/".join(c["hex"] for c in g["colors"])}' for g in result["garments"]) or "none"
    log.info("segment %dx%d: %s (%.0fms)", img.width, img.height, summary, result["ms"])
    return result


if __name__ == "__main__":
    uvicorn.run(app, host=HOST, port=PORT)
