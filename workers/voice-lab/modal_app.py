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


# Tried in order. L40S alone waited 6+ min for capacity, past Modal's 150 s web
# limit; see history/voice-lab.md 2026-11-13. All three support bf16.
GPU_FUNCTION = dict(
    image=image,
    gpu=os.environ.get("VOICE_LAB_GPU", "L40S,L4,A10G").split(","),
    cpu=1,
    memory=8192,
    volumes={"/cache": hf_cache},
    secrets=[modal.Secret.from_name("voice-lab")],
    min_containers=0,
    max_containers=1,
    scaledown_window=30,
)


# Batch jobs run here, not in `web`: a container with no request in flight can
# be scaled down mid-job, and a spawned function is what keeps it alive.
@app.function(timeout=3600, **GPU_FUNCTION)
def process_job(payload: dict):
    from app import JobRequest, run_job

    run_job(JobRequest(**payload))


@app.function(timeout=300, **GPU_FUNCTION)
@modal.asgi_app()
def web():
    import app as worker_module

    worker_module.job_launcher = lambda payload: process_job.spawn(payload)
    return worker_module.app
