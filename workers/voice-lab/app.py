import asyncio
import base64
import io
import os
import time
from pathlib import Path
from threading import Lock
from typing import Literal

import soundfile as sf
import torch
from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

MODEL_ID = os.getenv("VOICE_MODEL_ID", "openbmb/VoxCPM2")
DEVICE = os.getenv("VOICE_DEVICE", "auto")
OPTIMIZE = os.getenv("VOICE_OPTIMIZE", "1") != "0"
WORKER_TOKEN = os.getenv("VOICE_LAB_WORKER_TOKEN", os.getenv("VOICE_WORKER_TOKEN", "")).strip()
REFERENCE_AUDIO = {
    "waiyan": Path(__file__).parent / "reference_audio" / "waiyan.wav",
    "yuzana": Path(__file__).parent / "reference_audio" / "yuzana.wav",
}

app = FastAPI(title="AI Storybook Voice Lab Worker")
_model = None
_model_lock = Lock()


class GenerateRequest(BaseModel):
    text: str = Field(min_length=1, max_length=600)
    stylePrompt: str = Field(min_length=1, max_length=300)
    seed: int = Field(ge=0, le=2_147_483_647)
    referenceAudioId: Literal["waiyan", "yuzana"] | None = None
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


def synthesize(request: GenerateRequest):
    started = time.perf_counter()
    with _model_lock:
        model = get_model()
        designed_text = f"({request.stylePrompt}){request.text.strip()}"
        torch.manual_seed(request.seed)
        reference_path = REFERENCE_AUDIO[request.referenceAudioId] if request.referenceAudioId else None
        if reference_path is not None and not reference_path.is_file():
            raise FileNotFoundError(f"Reference audio is missing: {reference_path.name}")
        reference_text = request.referenceText if reference_path else None
        audio = model.generate(
            text=designed_text,
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
    duration = len(audio) / sample_rate
    return {
        "audioBase64": base64.b64encode(output.getvalue()).decode("ascii"),
        "contentType": "audio/wav",
        "durationSeconds": round(duration, 3),
        "sampleRate": sample_rate,
        "generationMs": round((time.perf_counter() - started) * 1000),
        "seed": request.seed,
    }


@app.post("/generate", dependencies=[Depends(authorize)])
async def generate(request: GenerateRequest):
    try:
        return await asyncio.to_thread(synthesize, request)
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(status_code=500, detail=f"Voice generation failed: {error}") from error
