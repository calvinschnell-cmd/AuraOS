"""AURA OS pose dataset, step 2: automatic landmark extraction + filtering.

Runs MediaPipe Pose Landmarker (IMAGE mode, same Tasks API and landmark
format as the kiosk) over every collected photo and keeps only clean samples,
so no manual review is needed beyond spot-checking:

- no person detected                     -> dropped
- several people of similar size         -> dropped (a small background figure is ignored)
- key joints (shoulders, elbows, wrists, hips, knees, ankles) not confidently
  visible, i.e. not a full-body shot     -> dropped

Survivors go to landmarks.jsonl (committed; raw photos are not). Features and
training live in TypeScript (lib/pose/, scripts/pose-train.ts) so the kiosk
computes features with the exact same code at battle time.

Run:  .venv\\Scripts\\python extract.py
"""

import json
import sys
import urllib.request
from collections import Counter
from pathlib import Path

import mediapipe as mp
import numpy as np
from PIL import Image
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision

HERE = Path(__file__).parent
DATA = HERE / "data"
MODELS = HERE / "models"
OUT = HERE / "landmarks.jsonl"
# "full" is more accurate than the kiosk's live "lite" model; offline, accuracy wins.
MODEL_URL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task"
MODEL_PATH = MODELS / "pose_landmarker_full.task"

KEY_JOINTS = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]
MIN_KEY_VISIBILITY = 0.5
# At most this many key joints may fall below MIN_KEY_VISIBILITY (a hand behind the back, feet at the frame edge).
MAX_WEAK_JOINTS = 2
# A second person at least this large (bbox area vs the main person) makes the photo ambiguous.
SECOND_PERSON_RATIO = 0.35
# The main person must fill at least this share of the frame height.
MIN_HEIGHT_SHARE = 0.35


def ensure_model() -> Path:
    if not MODEL_PATH.exists():
        MODELS.mkdir(parents=True, exist_ok=True)
        print(f"downloading {MODEL_URL}")
        urllib.request.urlretrieve(MODEL_URL, MODEL_PATH)
    return MODEL_PATH


def bbox(landmarks) -> tuple[float, float, float, float]:
    xs = [p.x for p in landmarks]
    ys = [p.y for p in landmarks]
    return min(xs), min(ys), max(xs), max(ys)


def area(b) -> float:
    return max(0.0, b[2] - b[0]) * max(0.0, b[3] - b[1])


def main() -> int:
    manifest_path = DATA / "manifest.jsonl"
    if not manifest_path.exists():
        print("no data/manifest.jsonl: run collect.py first", file=sys.stderr)
        return 1
    entries = [json.loads(line) for line in manifest_path.read_text(encoding="utf-8").splitlines() if line.strip()]

    options = vision.PoseLandmarkerOptions(
        base_options=mp_python.BaseOptions(model_asset_path=str(ensure_model())),
        running_mode=vision.RunningMode.IMAGE,
        num_poses=3,
        min_pose_detection_confidence=0.5,
        min_pose_presence_confidence=0.5,
    )
    kept: Counter = Counter()
    dropped: Counter = Counter()
    with vision.PoseLandmarker.create_from_options(options) as landmarker, OUT.open("w", encoding="utf-8") as out:
        for i, e in enumerate(entries):
            path = DATA / e["file"]
            if not path.exists():
                dropped["missing"] += 1
                continue
            try:
                # Grayscale / CMYK / alpha photos all become plain RGB (the model wants 3 channels).
                with Image.open(path) as im:
                    rgb = np.asarray(im.convert("RGB"))
                image = mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(rgb))
                result = landmarker.detect(image)
            except Exception as err:  # noqa: BLE001 - a corrupt file never stops the batch
                print(f"  ! {e['file']}: {err}", file=sys.stderr)
                dropped["unreadable"] += 1
                continue

            poses = result.pose_landmarks
            if not poses:
                dropped["no_person"] += 1
                continue
            boxes = sorted(((area(bbox(p)), p) for p in poses), key=lambda t: t[0], reverse=True)
            main_area, main = boxes[0]
            if len(boxes) > 1 and boxes[1][0] >= SECOND_PERSON_RATIO * main_area:
                dropped["multiple_people"] += 1
                continue
            weak = sum(1 for j in KEY_JOINTS if (main[j].visibility or 0) < MIN_KEY_VISIBILITY)
            if weak > MAX_WEAK_JOINTS:
                dropped["low_confidence"] += 1
                continue
            b = bbox(main)
            if b[3] - b[1] < MIN_HEIGHT_SHARE:
                dropped["too_small"] += 1
                continue

            kept[e["category"]] += 1
            out.write(
                json.dumps(
                    {
                        "id": Path(e["file"]).stem,
                        "category": e["category"],
                        "width": image.width,
                        "height": image.height,
                        "landmarks": [[round(p.x, 4), round(p.y, 4), round(p.z, 4), round(p.visibility or 0, 3)] for p in main],
                        "source": e.get("source"),
                        "license": e.get("license"),
                    },
                    separators=(",", ":"),
                )
                + "\n"
            )
            if (i + 1) % 100 == 0:
                print(f"  {i + 1}/{len(entries)} processed")

    print("kept:", dict(kept), "total", sum(kept.values()))
    print("dropped:", dict(dropped), "total", sum(dropped.values()))
    return 0


if __name__ == "__main__":
    sys.exit(main())
