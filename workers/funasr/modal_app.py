from __future__ import annotations

import asyncio
import os
import re
import subprocess
import tempfile

import modal

CACHE = "/cache"

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg")
    .pip_install("torch==2.5.1", "torchaudio==2.5.1", "funasr==1.2.7", "modelscope", "fastapi[standard]")
    .env({"HF_HOME": f"{CACHE}/huggingface", "MODELSCOPE_CACHE": f"{CACHE}/modelscope"})
)

with image.imports():
    from fastapi import HTTPException, Request
    from funasr import AutoModel

app = modal.App("funasr")
cache = modal.Volume.from_name("funasr-cache", create_if_missing=True)

PUNCTUATION = re.compile(r"[\s　-〿＀-￯.,!?;:'\"()\[\]-]+")
TOKEN = re.compile(r"[A-Za-z0-9']+|[^\sA-Za-z0-9']")


def _tokens(text: str) -> list[str]:
    # Paraformer stamps one interval per CJK character and per Latin word, with
    # the punctuation model's marks added afterwards and unstamped.
    return TOKEN.findall(PUNCTUATION.sub(" ", text))


@app.cls(
    image=image,
    gpu=os.environ.get("FUNASR_GPU", "T4"),
    volumes={CACHE: cache},
    secrets=[modal.Secret.from_name("funasr")],
    timeout=3600,
    max_containers=1,
    scaledown_window=10,
)
class FunAsr:
    @modal.enter()
    def load(self):
        self.model = AutoModel(
            model="paraformer-zh",
            vad_model="fsmn-vad",
            punc_model="ct-punc",
            device="cuda:0",
            disable_update=True,
        )

    def _transcribe(self, path: str, words: bool) -> dict:
        wav = f"{path}.wav"
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", path, "-ac", "1", "-ar", "16000", wav], check=True)
        result = self.model.generate(input=wav, batch_size_s=300, sentence_timestamp=True)[0]
        segments = []
        word_list = []
        for sentence in result.get("sentence_info", []):
            text = sentence["text"].strip()
            if not text:
                continue
            segments.append({"start": sentence["start"] / 1000, "end": sentence["end"] / 1000, "text": text})
            if not words:
                continue
            stamps = sentence.get("timestamp", [])
            tokens = _tokens(text)
            if len(tokens) != len(stamps):
                print(f"token/stamp mismatch ({len(tokens)} vs {len(stamps)}): {text}", flush=True)
            for token, (start, end) in zip(tokens, stamps):
                word_list.append({"word": token, "start": start / 1000, "end": end / 1000})
        response = {"language": "zh", "segments": segments}
        if words:
            response["words"] = word_list
        return response

    @modal.fastapi_endpoint(method="POST")
    async def transcribe(self, request: Request, words: bool = False):
        token = os.environ.get("ASR_WORKER_TOKEN", "").strip()
        if not token or request.headers.get("authorization") != f"Bearer {token}":
            raise HTTPException(status_code=401, detail="Invalid worker token.")
        audio = await request.body()
        if not audio:
            raise HTTPException(status_code=400, detail="No audio in the request body.")
        with tempfile.NamedTemporaryFile() as file:
            file.write(audio)
            file.flush()
            return await asyncio.to_thread(self._transcribe, file.name, words)
