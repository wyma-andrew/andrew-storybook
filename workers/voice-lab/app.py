import asyncio
import base64
import io
import json
import os
import threading
import time
import urllib.request
from pathlib import Path
from threading import Lock
from typing import Callable, Literal

import soundfile as sf
import torch
from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

MODEL_ID = os.getenv("VOICE_MODEL_ID", "openbmb/VoxCPM2")
DEVICE = os.getenv("VOICE_DEVICE", "auto")
OPTIMIZE = os.getenv("VOICE_OPTIMIZE", "1") != "0"
WORKER_TOKEN = os.getenv("VOICE_LAB_WORKER_TOKEN", os.getenv("VOICE_WORKER_TOKEN", "")).strip()
REFERENCE_AUDIO = {
    "dhamma-1": Path(__file__).parent / "reference_audio" / "dhamma-1.wav",
    "dhamma-3": Path(__file__).parent / "reference_audio" / "dhamma-3.wav",
    "wise-elder": Path(__file__).parent / "reference_audio" / "wise-elder.wav",
    "grandpa": Path(__file__).parent / "reference_audio" / "grandpa.wav",
}

app = FastAPI(title="AI Storybook Voice Lab Worker")
_model = None
_model_lock = Lock()


class GenerateRequest(BaseModel):
    text: str = Field(min_length=1, max_length=600)
    stylePrompt: str = Field(min_length=1, max_length=300)
    seed: int = Field(ge=0, le=2_147_483_647)
    referenceAudioId: Literal["dhamma-1", "dhamma-3", "wise-elder", "grandpa"] | None = None
    referenceText: str | None = Field(default=None, max_length=1000)


def authorize(authorization: str | None = Header(default=None)):
    if not WORKER_TOKEN:
        return
    if authorization != f"Bearer {WORKER_TOKEN}":
        raise HTTPException(status_code=401, detail="Invalid worker token.")


def get_model():
    global _model
    if _model is None:
        from voxcpm import VoxCPM

        _model = VoxCPM.from_pretrained(
            MODEL_ID,
            device=DEVICE,
            optimize=OPTIMIZE and DEVICE.startswith("cuda"),
            load_denoiser=DEVICE.startswith("cuda"),
        )
    return _model


def render_wav(request: GenerateRequest):
    with _model_lock:
        model = get_model()
        torch.manual_seed(request.seed)
        reference_path = REFERENCE_AUDIO[request.referenceAudioId] if request.referenceAudioId else None
        if reference_path is not None and not reference_path.is_file():
            raise FileNotFoundError(f"Reference audio is missing: {reference_path.name}")
        reference_text = request.referenceText if reference_path else None
        audio = model.generate(
            text=request.text.strip(),
            prompt_wav_path=str(reference_path) if reference_path and reference_text else None,
            prompt_text=reference_text,
            reference_wav_path=str(reference_path) if reference_path else None,
            normalize=True,
            cfg_value=2.0,
            inference_timesteps=10,
        )
        sample_rate = int(model.tts_model.sample_rate)

    output = io.BytesIO()
    sf.write(output, audio, sample_rate, format="WAV", subtype="PCM_16")
    return output.getvalue(), len(audio) / sample_rate, sample_rate


def synthesize(request: GenerateRequest):
    started = time.perf_counter()
    wav, duration, sample_rate = render_wav(request)
    return {
        "audioBase64": base64.b64encode(wav).decode("ascii"),
        "contentType": "audio/wav",
        "durationSeconds": round(duration, 3),
        "sampleRate": sample_rate,
        "generationMs": round((time.perf_counter() - started) * 1000),
        "seed": request.seed,
    }


class JobItem(BaseModel):
    id: str
    text: str = Field(min_length=1, max_length=600)
    uploadUrl: str


class JobRequest(BaseModel):
    jobId: str
    items: list[JobItem] = Field(min_length=1, max_length=200)
    stylePrompt: str = Field(min_length=1, max_length=300)
    seed: int = Field(ge=0, le=2_147_483_647)
    referenceAudioId: Literal["dhamma-1", "dhamma-3", "wise-elder", "grandpa"] | None = None
    referenceText: str | None = Field(default=None, max_length=1000)
    callbackUrl: str


def _send(request: urllib.request.Request):
    with urllib.request.urlopen(request, timeout=60) as response:
        response.read()


def _upload(url: str, wav: bytes):
    _send(urllib.request.Request(url, data=wav, method="PUT", headers={"content-type": "audio/wav"}))


def _report(callback_url: str, payload: dict):
    headers = {"content-type": "application/json"}
    if WORKER_TOKEN:
        headers["authorization"] = f"Bearer {WORKER_TOKEN}"
    body = json.dumps(payload).encode()
    for attempt in range(3):
        try:
            _send(urllib.request.Request(callback_url, data=body, method="POST", headers=headers))
            return
        except Exception:
            if attempt == 2:
                raise
            time.sleep(2 * (attempt + 1))


def run_job(job: JobRequest):
    for item in job.items:
        try:
            wav, duration, _ = render_wav(
                GenerateRequest(
                    text=item.text,
                    stylePrompt=job.stylePrompt,
                    seed=job.seed,
                    referenceAudioId=job.referenceAudioId,
                    referenceText=job.referenceText,
                )
            )
            _upload(item.uploadUrl, wav)
            result = {"itemId": item.id, "status": "done", "durationSeconds": round(duration, 3)}
        except Exception as error:
            result = {"itemId": item.id, "status": "failed", "error": f"Voice generation failed: {error}"[:500]}
        try:
            _report(job.callbackUrl, result)
        except Exception as error:
            print(f"callback to {job.callbackUrl} failed for item {item.id}: {error}", flush=True)


# modal_app.py points this at a spawned Modal function; a plain local run falls
# back to a thread. A background thread alone would die with an idle container.
job_launcher: Callable[[dict], None] | None = None


@app.post("/jobs", status_code=202, dependencies=[Depends(authorize)])
def create_job(job: JobRequest):
    if job_launcher is not None:
        job_launcher(job.model_dump())
    else:
        threading.Thread(target=run_job, args=(job,), daemon=True).start()
    return {"jobId": job.jobId, "accepted": len(job.items)}


@app.post("/generate", dependencies=[Depends(authorize)])
async def generate(request: GenerateRequest):
    try:
        return await asyncio.to_thread(synthesize, request)
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(status_code=500, detail=f"Voice generation failed: {error}") from error
