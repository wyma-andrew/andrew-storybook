import os
from pathlib import Path

import modal

HF_CACHE = "/cache/huggingface"

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("libsndfile1")
    .pip_install_from_requirements(str(Path(__file__).parent / "requirements.txt"))
    .env({"VOICE_DEVICE": "cuda", "VOICE_OPTIMIZE": "0", "HF_HOME": HF_CACHE})
    .add_local_file(Path(__file__).parent / "app.py", "/root/app.py")
    .add_local_dir(Path(__file__).parent / "reference_audio", "/root/reference_audio")
)

app = modal.App("voice-lab")
hf_cache = modal.Volume.from_name("voice-lab-hf-cache", create_if_missing=True)


# Sized for free-credit use; see history/voice-lab.md (2026-09-28). T4 lacks
# native bf16 — redeploy with VOICE_LAB_GPU=L4 if generation fails or crawls.
@app.function(
    image=image,
    gpu=os.environ.get("VOICE_LAB_GPU", "T4"),
    cpu=1,
    memory=8192,
    volumes={"/cache": hf_cache},
    secrets=[modal.Secret.from_name("voice-lab")],
    min_containers=0,
    max_containers=1,
    scaledown_window=20,
    timeout=300,
)
@modal.asgi_app()
def web():
    from app import app as worker

    return worker
