import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  ListPartsCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Cloudflare R2 is S3-compatible, so the AWS SDK talks to it unchanged — the
// only differences are the endpoint and a fixed "auto" region.
//
// Server-only. Nothing here may be imported from a client component: these
// credentials are not NEXT_PUBLIC_ and must never reach the browser. The browser
// receives a presigned URL and nothing else.
const ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;

export const R2_BUCKET = process.env.R2_BUCKET ?? "";
// Public read base ("https://pub-xxxx.r2.dev" or a custom domain). Stored per
// row at upload time rather than composed at read time — see the migration.
export const R2_PUBLIC_BASE_URL = (process.env.R2_PUBLIC_BASE_URL ?? "").replace(/\/+$/, "");

export function r2Configured() {
  return !!(ACCOUNT_ID && ACCESS_KEY_ID && SECRET_ACCESS_KEY && R2_BUCKET && R2_PUBLIC_BASE_URL);
}

let client: S3Client | null = null;

function r2() {
  if (!r2Configured()) throw new Error("R2 is not configured — set R2_* in .env.");
  client ??= new S3Client({
    region: "auto",
    endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: ACCESS_KEY_ID!, secretAccessKey: SECRET_ACCESS_KEY! },
    // Flexible checksums are ON by default in aws-sdk v3 >= 3.729, and they
    // break a presigned browser PUT: the signed URL picks up
    // x-amz-sdk-checksum-algorithm, so the request is signed expecting an
    // x-amz-checksum-crc32 header that a plain fetch() never sends, and R2
    // rejects the signature. The uploader here is a browser with a bare PUT,
    // so the checksum has to be opt-in rather than automatic.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  return client;
}

// Only these reach R2. Checked on the server when minting the presigned URL, not
// only in the file picker — a picker filter is a convenience, not a control, and
// the presigned URL is what actually grants the write.
const IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/avif",
  "image/svg+xml",
  "image/bmp",
  "image/tiff",
]);

export function isImageContentType(contentType: unknown): contentType is string {
  return typeof contentType === "string" && IMAGE_TYPES.has(contentType.toLowerCase());
}

const LOGO_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export function isLogoContentType(contentType: unknown): contentType is string {
  return typeof contentType === "string" && LOGO_TYPES.has(contentType.toLowerCase());
}

export function isVideoContentType(contentType: unknown): contentType is string {
  return typeof contentType === "string" && contentType.toLowerCase().startsWith("video/");
}

// Keys are the file's own name, so the bucket stays browsable: a chapter prefix
// holding 1.1.png, 1.2.png, … rather than uuid-prefixed noise. A folder upload
// sends paths ("scene1/1.2.png"), and two folders can hold the same basename, so
// a counter suffix is what keeps them apart — see nextFreeName below.
export function chapterPrefix(chapterId: string) {
  return `chapters/${chapterId}/`;
}

// Object keys must survive being a URL path segment, so they are reduced to
// [word . -]. The DISPLAY name keeps its original spelling (Burmese included)
// and is stored separately — this is only the key.
function sanitizeForKey(basename: string) {
  return basename.replace(/[^\w.\-]+/g, "_").slice(-120) || "file";
}

export function movieRecapObjectKey(projectId: string, kind: "source" | "logo" | "render" | "subtitle", fileName: string) {
  return `movie-recaps/${projectId}/${kind}/${crypto.randomUUID()}-${sanitizeForKey(baseNameOf(fileName))}`;
}

function splitName(basename: string) {
  const dot = basename.lastIndexOf(".");
  return dot > 0 ? { stem: basename.slice(0, dot), ext: basename.slice(dot) } : { stem: basename, ext: "" };
}

export function baseNameOf(fileName: string) {
  return fileName.split(/[\\/]/).pop() || "file";
}

// Resolves one upload to a name nothing else in the chapter is using. `taken`
// holds the object keys already in the chapter — including the ones claimed
// earlier in this same batch, since a folder can carry two files with the same
// basename and neither is in the database yet.
//
// The SAME counter lands on the display name and on the key, so a gallery
// showing "1.2-2.png" and a bucket holding "1.2-2.png" agree. The counter is
// chosen against the key, not the display name: two different originals can
// sanitize to the same key (any two non-ASCII names, for instance), and the key
// is the one that must actually be unique.
export function nextFreeName(chapterId: string, fileName: string, taken: Set<string>) {
  const { stem, ext } = splitName(baseNameOf(fileName));
  const prefix = chapterPrefix(chapterId);

  for (let n = 1; ; n++) {
    const displayName = n === 1 ? `${stem}${ext}` : `${stem}-${n}${ext}`;
    const objectKey = prefix + sanitizeForKey(n === 1 ? `${stem}${ext}` : `${stem}-${n}${ext}`);
    if (!taken.has(objectKey)) {
      taken.add(objectKey);
      return { displayName, objectKey };
    }
  }
}

export function publicUrlFor(objectKey: string) {
  return `${R2_PUBLIC_BASE_URL}/${objectKey}`;
}

// 15 minutes: long enough for a big file on a slow connection, short enough that
// a leaked URL is not a standing write grant.
export function presignPut(objectKey: string, contentType: string) {
  return getSignedUrl(
    r2(),
    new PutObjectCommand({ Bucket: R2_BUCKET, Key: objectKey, ContentType: contentType }),
    { expiresIn: 900 }
  );
}

export async function deleteObject(objectKey: string) {
  await r2().send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: objectKey }));
}

// Server-generated files (render output, subtitles) never come from a browser
// upload, so the server writes them directly — no presigned URL involved.
export async function putObject(objectKey: string, body: Buffer, contentType: string) {
  await r2().send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: objectKey, Body: body, ContentType: contentType }));
  return publicUrlFor(objectKey);
}

export async function createMultipartUpload(objectKey: string, contentType: string) {
  const result = await r2().send(
    new CreateMultipartUploadCommand({ Bucket: R2_BUCKET, Key: objectKey, ContentType: contentType })
  );
  if (!result.UploadId) throw new Error("R2 did not return a multipart upload id.");
  return result.UploadId;
}

export function presignUploadPart(objectKey: string, uploadId: string, partNumber: number) {
  return getSignedUrl(
    r2(),
    new UploadPartCommand({ Bucket: R2_BUCKET, Key: objectKey, UploadId: uploadId, PartNumber: partNumber }),
    { expiresIn: 3600 }
  );
}

export async function listMultipartParts(objectKey: string, uploadId: string) {
  const parts: { partNumber: number; etag: string; size: number }[] = [];
  let marker: string | undefined;
  do {
    const result = await r2().send(
      new ListPartsCommand({
        Bucket: R2_BUCKET,
        Key: objectKey,
        UploadId: uploadId,
        PartNumberMarker: marker,
      })
    );
    for (const part of result.Parts ?? []) {
      if (part.PartNumber && part.ETag) {
        parts.push({ partNumber: part.PartNumber, etag: part.ETag, size: part.Size ?? 0 });
      }
    }
    marker = result.IsTruncated ? result.NextPartNumberMarker : undefined;
  } while (marker);
  return parts;
}

export async function completeMultipartUpload(
  objectKey: string,
  uploadId: string,
  parts: { partNumber: number; etag: string }[]
) {
  await r2().send(
    new CompleteMultipartUploadCommand({
      Bucket: R2_BUCKET,
      Key: objectKey,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: parts
          .slice()
          .sort((a, b) => a.partNumber - b.partNumber)
          .map((part) => ({ PartNumber: part.partNumber, ETag: part.etag })),
      },
    })
  );
}

export async function abortMultipartUpload(objectKey: string, uploadId: string) {
  await r2().send(
    new AbortMultipartUploadCommand({ Bucket: R2_BUCKET, Key: objectKey, UploadId: uploadId })
  );
}

// "1.2.png" must sort before "1.10.png". A plain string sort puts 1.10 first,
// which is wrong for exactly the filenames this gallery exists to hold — they
// are named after scene.shot numbers.
export function naturalCompare(a: string, b: string) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}
