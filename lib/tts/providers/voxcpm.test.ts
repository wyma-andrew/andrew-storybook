import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getVoiceById } from "../voices";
import { voxcpmProvider } from "./voxcpm";

const voice = getVoiceById("young-male")!;
const ok = () => new Response(JSON.stringify({ audioBase64: "UklGRg==", durationSeconds: 1, sampleRate: 16000 }), { status: 200 });

describe("voxcpm provider", () => {
  beforeEach(() => {
    vi.stubEnv("VOICE_LAB_WORKER_URL", "https://worker.test");
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("retries a bare 5xx, as a preempted container returns", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response("Internal Server Error", { status: 500 })).mockResolvedValueOnce(ok());
    vi.stubGlobal("fetch", fetchMock);
    const pending = voxcpmProvider.synthesize({ text: "မင်္ဂလာပါ", voice });
    await vi.runAllTimersAsync();
    await expect(pending).resolves.toMatchObject({ durationSeconds: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries a 408, as Modal returns when an input never reaches the container", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response("", { status: 408 })).mockResolvedValueOnce(ok());
    vi.stubGlobal("fetch", fetchMock);
    const pending = voxcpmProvider.synthesize({ text: "မင်္ဂလာပါ", voice });
    await vi.runAllTimersAsync();
    await expect(pending).resolves.toMatchObject({ durationSeconds: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry a 4xx", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: "bad" }), { status: 422 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(voxcpmProvider.synthesize({ text: "မင်္ဂလာပါ", voice })).rejects.toThrow("bad");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("gives up after three 5xx attempts", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response("", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    const pending = voxcpmProvider.synthesize({ text: "မင်္ဂလာပါ", voice });
    const assertion = expect(pending).rejects.toThrow("Voice worker returned 500.");
    await vi.runAllTimersAsync();
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
