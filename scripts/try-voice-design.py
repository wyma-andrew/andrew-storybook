import argparse
import base64
import json
import os
import urllib.request
from pathlib import Path


DESIGNS = {
    "1": "An elderly Burmese grandfather with a warm, deep, slightly textured voice, telling a story slowly and naturally, with gentle pauses and clear Burmese pronunciation",
    "2": "An elderly Burmese storyteller with a rich low baritone voice, calm and dignified, speaking at an unhurried pace with natural phrasing and quiet authority",
    "3": "An older Burmese uncle with a soft, resonant voice, gently narrating a traditional story, relaxed and slow, with expressive but restrained pauses",
}
SAMPLE_TEXT = "တစ်နေ့သ၌ မြတ်စွာဘုရားသည် သာဝတ္ထိပြည် ဇေတဝန်ကျောင်းတော်၌ သီတင်းသုံးတော်မူနေစဉ်။"
SEED = 20261011


def main():
    parser = argparse.ArgumentParser(description="Generate one VoxCPM2 voice-design sample.")
    parser.add_argument("design", choices=DESIGNS, help="Voice design 1, 2, or 3")
    args = parser.parse_args()

    worker_url = os.environ.get("VOICE_LAB_WORKER_URL", "").strip().rstrip("/")
    worker_token = os.environ.get("VOICE_LAB_WORKER_TOKEN", "").strip()
    if not worker_url:
        parser.error("VOICE_LAB_WORKER_URL is missing. Load the project .env first.")

    payload = {
        "text": f"({DESIGNS[args.design]}) {SAMPLE_TEXT}",
        "stylePrompt": DESIGNS[args.design],
        "seed": SEED,
    }
    headers = {"Content-Type": "application/json"}
    if worker_token:
        headers["Authorization"] = f"Bearer {worker_token}"
    request = urllib.request.Request(
        f"{worker_url}/generate",
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers=headers,
        method="POST",
    )

    with urllib.request.urlopen(request, timeout=300) as response:
        result = json.load(response)

    output = Path(__file__).resolve().parents[1] / "voice-design-samples" / f"voice-design-{args.design}.wav"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(base64.b64decode(result["audioBase64"]))
    print(output)


if __name__ == "__main__":
    main()
