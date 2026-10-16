# Voice Lab worker

This local Python service loads `openbmb/VoxCPM2` and returns short WAV clips to
the Next.js Voice Lab. The model is lazy-loaded on the first generation.
Wai Yan, Yuzana, the two Dhamma profiles, and ပညာရှိအဘိုး use fixed 16 kHz reference files
in `reference_audio/`; the Modal app attaches that directory to the worker runtime.
See the [official model card](https://huggingface.co/openbmb/VoxCPM2) and
[repository](https://github.com/OpenBMB/VoxCPM) for model and license details.

## Run locally

Python 3.10+, PyTorch 2.5+, and a supported CUDA GPU are recommended. Install
the PyTorch build appropriate for the machine first, then:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r workers/voice-lab/requirements.txt
cd workers/voice-lab
uvicorn app:app --host 127.0.0.1 --port 8808
```

Set these values in the Next.js `.env`:

```dotenv
VOICE_LAB_WORKER_URL=http://127.0.0.1:8808
VOICE_LAB_WORKER_TOKEN=replace-with-a-random-secret
```

Load the same project environment before starting the worker:

```bash
set -a
source ../../.env
set +a
uvicorn app:app --host 127.0.0.1 --port 8808
```

The worker reads `VOICE_LAB_WORKER_TOKEN` from that environment; the older
`VOICE_WORKER_TOKEN` name remains a fallback. Optional worker variables are
`VOICE_MODEL_ID` and `VOICE_DEVICE` (`auto`,
`cpu`, `mps`, or `cuda`). CPU generation can be impractically slow. Model files
are downloaded from Hugging Face on first load and are not stored in this repo.
`VOICE_OPTIMIZE=0` skips the `torch.compile` warm-up on CUDA.

## Deploy on Modal

`modal_app.py` serves the same FastAPI app on a scale-to-zero GPU. Run from
this directory:

```bash
pip install modal
modal token new
modal secret create voice-lab VOICE_LAB_WORKER_TOKEN=replace-with-a-random-secret
modal deploy modal_app.py
```

Set the printed `https://<workspace>--voice-lab-web.modal.run` URL as
`VOICE_LAB_WORKER_URL` in the Next.js `.env`, with the same token. The default
GPU is T4; `VOICE_LAB_GPU=L4 modal deploy modal_app.py` switches it. Set a
workspace spend limit in the Modal dashboard so usage stops at the free credit.
The first generation after an idle minute pays a cold start.
