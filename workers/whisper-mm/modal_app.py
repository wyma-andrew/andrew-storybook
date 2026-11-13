from __future__ import annotations

import asyncio
import os
import tempfile

import modal

CACHE = "/cache"

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg")
    .pip_install("torch==2.5.1", "fastapi[standard]", "setuptools<70", "wheel")
    # openai-whisper's setup.py imports pkg_resources, which newer setuptools
    # dropped; build against the pinned setuptools above instead of an isolated one.
    .pip_install("openai-whisper==20240930", extra_options="--no-build-isolation")
)

with image.imports():
    import whisper
    from fastapi import HTTPException, Request

app = modal.App("whisper-mm")
cache = modal.Volume.from_name("whisper-mm-cache", create_if_missing=True)


@app.cls(
    image=image,
    gpu=os.environ.get("WHISPER_MM_GPU", "T4"),
    volumes={CACHE: cache},
    secrets=[modal.Secret.from_name("whisper-mm")],
    timeout=3600,
    max_containers=1,
    scaledown_window=10,
)
class WhisperMyanmar:
    @modal.enter()
    def load(self):
        # large-v3, not turbo: turbo drops accuracy most on low-resource
        # languages, and Burmese is one. See history/transcript.md.
        self.model = whisper.load_model("large-v3", device="cuda", download_root=f"{CACHE}/whisper")

    # language None lets Whisper detect it; Movie Recap's non-Chinese sources
    # use that, the Burmese Transcript feature keeps "my".
    def _transcribe(self, path: str, language: str | None) -> dict:
        result = self.model.transcribe(
            path,
            language=language,
            task="transcribe",
            fp16=True,
            # Conditioning on its own output is how one invented line gets
            # repeated across a quiet stretch.
            condition_on_previous_text=False,
        )
        segments = [
            {
                "start": segment["start"],
                "end": segment["end"],
                "text": segment["text"].strip(),
                "no_speech_prob": segment.get("no_speech_prob"),
                "avg_logprob": segment.get("avg_logprob"),
                "compression_ratio": segment.get("compression_ratio"),
            }
            for segment in result.get("segments", [])
            if segment["text"].strip()
        ]
        return {"language": result.get("language", language), "segments": segments}

    @modal.fastapi_endpoint(method="POST")
    async def transcribe(self, request: Request):
        token = os.environ.get("WHISPER_MM_WORKER_TOKEN", "").strip()
        if not token or request.headers.get("authorization") != f"Bearer {token}":
            raise HTTPException(status_code=401, detail="Invalid worker token.")
        audio = await request.body()
        if not audio:
            raise HTTPException(status_code=400, detail="No audio in the request body.")
        with tempfile.NamedTemporaryFile() as file:
            file.write(audio)
            file.flush()
            requested = request.query_params.get("language", "my").strip() or "my"
            language = None if requested == "auto" else requested
            return await asyncio.to_thread(self._transcribe, file.name, language)
