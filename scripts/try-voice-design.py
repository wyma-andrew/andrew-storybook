import argparse
import base64
import json
import os
import urllib.request
from pathlib import Path


ELDER_TEXT = "တစ်နေ့သ၌ မြတ်စွာဘုရားသည် သာဝတ္ထိပြည် ဇေတဝန်ကျောင်းတော်၌ သီတင်းသုံးတော်မူနေစဉ်။"
# Same line as SAMPLE_TEXT in lib/tts/voices.ts, so candidates compare with the catalog voices.
NARRATOR_TEXT = "ဒီဇာတ်လမ်းရဲ့ နောက်ကွယ်က အကြောင်းအရာတွေကို အတူတူ လေ့လာကြရအောင်။"

DESIGNS = {
    "1": ("An elderly Burmese grandfather with a warm, deep, slightly textured voice, telling a story slowly and naturally, with gentle pauses and clear Burmese pronunciation", ELDER_TEXT),
    "2": ("An elderly Burmese storyteller with a rich low baritone voice, calm and dignified, speaking at an unhurried pace with natural phrasing and quiet authority", ELDER_TEXT),
    "3": ("An older Burmese uncle with a soft, resonant voice, gently narrating a traditional story, relaxed and slow, with expressive but restrained pauses", ELDER_TEXT),
    "female-1": ("A Burmese woman in her forties narrating a movie recap, warm and clear mid-range voice, confident and engaging, steady cinematic pacing with natural pauses", NARRATOR_TEXT),
    "female-2": ("A middle-aged Burmese female documentary narrator, smooth and slightly low voice, calm and composed, polished delivery with subtle suspense", NARRATOR_TEXT),
    "male-1": ("A Burmese man in his forties narrating a movie recap, deep and clear baritone, confident storyteller, steady cinematic pacing with natural pauses", NARRATOR_TEXT),
    "male-2": ("A middle-aged Burmese male film trailer narrator, rich warm voice with gentle gravel, dramatic but controlled, measured pace building suspense", NARRATOR_TEXT),
    "young-female-1": ("A Burmese woman in her late twenties narrating a movie recap, bright and clear voice, friendly and lively, natural conversational pacing with smooth pauses", NARRATOR_TEXT),
    "young-female-2": ("A young Burmese female storyteller around 25, soft and expressive voice, calm and intimate, gently building suspense with natural phrasing", NARRATOR_TEXT),
    "young-male-1": ("A Burmese man in his late twenties narrating a movie recap, clear and energetic tenor-baritone voice, confident and engaging, steady natural pacing", NARRATOR_TEXT),
    "young-male-2": ("A young Burmese male storyteller around 30, smooth relaxed voice, cool and confident, conversational cinematic delivery with subtle suspense", NARRATOR_TEXT),
    # Second young round: the first ones paused between words. No "pauses" in the
    # description, and fluent, connected speech asked for explicitly.
    "young-female-3": ("A Burmese woman in her late twenties narrating a movie recap, clear and warm voice, fluent and continuous speech with smoothly connected words, lively natural speed", NARRATOR_TEXT),
    "young-female-4": ("A young Burmese female YouTube storyteller around 27, bright friendly voice, speaks fluently in one smooth flow, confident and engaging, brisk natural pace", NARRATOR_TEXT),
    "young-male-3": ("A Burmese man in his late twenties narrating a movie recap, clear warm voice, fluent and continuous speech with smoothly connected words, confident natural speed", NARRATOR_TEXT),
    "young-male-4": ("A young Burmese male YouTube storyteller around 30, smooth relaxed voice, speaks fluently in one easy flow, engaging and confident, brisk natural pace", NARRATOR_TEXT),
    # young-male-2 was liked but sounded muffled; same voice, asked for clarity.
    "young-male-2-clear": ("A young Burmese male storyteller around 30, smooth relaxed voice, cool and confident, conversational cinematic delivery with subtle suspense, crisp clear articulation, clean bright studio recording", NARRATOR_TEXT),
    "young-male-2-clear-close": ("A young Burmese male storyteller around 30, smooth relaxed voice with clear bright tone, cool and confident, conversational cinematic delivery, close-mic professional voice-over, crisp and clean", NARRATOR_TEXT),
}
SEED = 20261011


def main():
    parser = argparse.ArgumentParser(description="Generate one VoxCPM2 voice-design sample.")
    parser.add_argument("design", choices=DESIGNS, help="Voice design key")
    parser.add_argument("--seed", type=int, default=SEED, help="Seed; keep the default to compare descriptions")
    args = parser.parse_args()

    worker_url = os.environ.get("VOICE_LAB_WORKER_URL", "").strip().rstrip("/")
    worker_token = os.environ.get("VOICE_LAB_WORKER_TOKEN", "").strip()
    if not worker_url:
        parser.error("VOICE_LAB_WORKER_URL is missing. Load the project .env first.")

    description, text = DESIGNS[args.design]
    payload = {
        "text": f"({description}) {text}",
        "stylePrompt": description,
        "seed": args.seed,
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

    output = Path(__file__).resolve().parents[1] / "voice-design-samples" / f"voice-design-{args.design}{'' if args.seed == SEED else f'-seed{args.seed}'}.wav"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(base64.b64decode(result["audioBase64"]))
    print(output)


if __name__ == "__main__":
    main()
