const LOGO_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_LOGO_BYTES = 2 * 1024 * 1024;

export type LogoUpload = { fileName: string; contentType: string; image: Buffer };

export function isUploadableLogoType(contentType: unknown) {
  return typeof contentType === "string" && LOGO_TYPES.has(contentType.toLowerCase());
}

// A small logo sent inline as base64 JSON: { fileName, contentType, imageBase64 }.
export function parseLogoUpload(body: { fileName?: unknown; contentType?: unknown; imageBase64?: unknown } | null): LogoUpload | string {
  const imageBase64 = body?.imageBase64;
  if (typeof body?.fileName !== "string" || !body.fileName.trim() || !isUploadableLogoType(body.contentType) || typeof imageBase64 !== "string"
    || imageBase64.length > MAX_LOGO_BYTES * 1.4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(imageBase64)) {
    return "The logo must be a PNG, JPEG or WebP under 2 MB.";
  }
  const image = Buffer.from(imageBase64, "base64");
  if (!image.length || image.length > MAX_LOGO_BYTES) return "The logo must be under 2 MB.";
  return { fileName: body.fileName.trim().slice(0, 200), contentType: String(body.contentType).toLowerCase(), image };
}
