// Both the Voice Lab and the Movie Recap voice picker receive synthesized audio
// as base64 JSON (the routes return a WAV inline rather than streaming a binary
// body) and need a playable object URL out of it.
export function audioUrlFromBase64(audioBase64: string, contentType: string) {
  const binary = window.atob(audioBase64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return URL.createObjectURL(new Blob([bytes], { type: contentType }));
}
