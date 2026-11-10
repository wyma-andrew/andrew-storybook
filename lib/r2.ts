import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  ListPartsCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { open } from "node:fs/promises";
import type { Readable } from "node:stream";

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

export function movieRecapProjectPrefix(projectId: string) {
  return `movie-recaps/${projectId}/`;
}

export function translateProjectPrefix(projectId: string) {
  return `translate-projects/${projectId}/`;
}

export function translateObjectKey(projectId: string, kind: "source" | "render", fileName: string) {
  return `${translateProjectPrefix(projectId)}${kind}/${crypto.randomUUID()}-${sanitizeForKey(baseNameOf(fileName))}`;
}

export function transcriptProjectPrefix(projectId: string) {
  return `transcripts/${projectId}/`;
}

export function transcriptObjectKey(projectId: string, fileName: string) {
  return `${transcriptProjectPrefix(projectId)}source/${crypto.randomUUID()}-${sanitizeForKey(baseNameOf(fileName))}`;
}

export function recapV2ProjectPrefix(projectId: string) {
  return `recap-v2/${projectId}/`;
}

export function recapV2ObjectKey(projectId: string, kind: "source" | "render", fileName: string) {
  return `${recapV2ProjectPrefix(projectId)}${kind}/${crypto.randomUUID()}-${sanitizeForKey(baseNameOf(fileName))}`;
}

// The speech worker's raw segments and character stamps, so lines can be
// re-split after a segmentation change without listening again.
export function recapV2AsrKey(projectId: string) {
  return `${recapV2ProjectPrefix(projectId)}asr/transcript.json`;
}

export function recapV2NarrationKey(projectId: string, hash: string) {
  return `${recapV2ProjectPrefix(projectId)}narration/${hash}.wav`;
}

export function movieRecapAssetPrefix(projectId: string, kind: "source" | "narration" | "render" | "subtitle" | "analysis") {
  return `${movieRecapProjectPrefix(projectId)}${kind}/`;
}

// Narration audio, keyed by WHAT WAS SAID rather than by beat number: the same
// words in the same voice synthesize to the same clip, so a re-render pays
// nothing for lines that did not change, and editing one line re-synthesizes
// only that one. Under the project prefix, so deleting the project takes the
// cache with it (see history/movie-recap.md on prefix deletion).
export function movieRecapNarrationKey(projectId: string, hash: string) {
  return `${movieRecapAssetPrefix(projectId, "narration")}${hash}.wav`;
}

export function movieRecapNarrationTimingKey(projectId: string, hash: string) {
  return `${movieRecapAssetPrefix(projectId, "narration")}${hash}.beats.json`;
}

export function movieRecapObjectKey(projectId: string, kind: "source" | "logo" | "render" | "subtitle" | "analysis", fileName: string) {
  const prefix = kind === "logo" ? `${movieRecapProjectPrefix(projectId)}logo/` : movieRecapAssetPrefix(projectId, kind);
  return `${prefix}${crypto.randomUUID()}-${sanitizeForKey(baseNameOf(fileName))}`;
}

export function movieRecapLogoTemplateObjectKey(templateId: string, fileName: string) {
  return `movie-recap-logo-templates/${templateId}/logo/${crypto.randomUUID()}-${sanitizeForKey(baseNameOf(fileName))}`;
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

export function presignDownload(objectKey: string, filename: string, expiresIn = 300) {
  return getSignedUrl(
    r2(),
    new GetObjectCommand({
      Bucket: R2_BUCKET,
      Key: objectKey,
      ResponseContentDisposition: `attachment; filename="${filename.replace(/["\\]/g, "-")}"`,
    }),
    { expiresIn }
  );
}

// Deletes everything under a prefix, not a list of keys held in columns. A
// project accumulates objects nothing tracks — every superseded render output,
// its subtitles — and a key-by-key cleanup leaks exactly those.
export async function deletePrefix(prefix: string) {
  let token: string | undefined;
  let deleted = 0;
  do {
    const listed = await r2().send(
      new ListObjectsV2Command({ Bucket: R2_BUCKET, Prefix: prefix, ContinuationToken: token })
    );
    const keys = (listed.Contents ?? []).map((object) => object.Key).filter((key): key is string => !!key);
    if (keys.length) {
      await r2().send(new DeleteObjectsCommand({ Bucket: R2_BUCKET, Delete: { Objects: keys.map((Key) => ({ Key })) } }));
      deleted += keys.length;
    }
    token = listed.IsTruncated ? listed.NextContinuationToken : undefined;
  } while (token);
  return deleted;
}

export async function deleteObject(objectKey: string) {
  await r2().send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: objectKey }));
}

export async function objectExists(objectKey: string) {
  try {
    await r2().send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: objectKey }));
    return true;
  } catch (error) {
    if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) return false;
    throw error;
  }
}

// Server-generated files (render output, subtitles) never come from a browser
// upload, so the server writes them directly — no presigned URL involved.
export async function putObject(objectKey: string, body: Buffer, contentType: string) {
  await r2().send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: objectKey, Body: body, ContentType: contentType }));
  return publicUrlFor(objectKey);
}

export async function uploadFileToR2(objectKey: string, filePath: string, contentType: string) {
  const file = await open(filePath, "r");
  let uploadId: string | null = null;
  try {
    const size = (await file.stat()).size;
    if (size < 16 * 1024 * 1024) {
      const bytes = Buffer.allocUnsafe(size);
      let read = 0;
      while (read < size) {
        const result = await file.read(bytes, read, size - read, read);
        if (!result.bytesRead) throw new Error("Render output ended before upload completed.");
        read += result.bytesRead;
      }
      return putObject(objectKey, bytes, contentType);
    }
    const chunkSize = Math.max(16 * 1024 * 1024, Math.ceil(size / 10_000 / (1024 * 1024)) * 1024 * 1024);
    uploadId = await createMultipartUpload(objectKey, contentType);
    const parts: { partNumber: number; etag: string }[] = [];
    for (let offset = 0, partNumber = 1; offset < size; offset += chunkSize, partNumber++) {
      const bytes = Buffer.allocUnsafe(Math.min(chunkSize, size - offset));
      let read = 0;
      while (read < bytes.length) {
        const result = await file.read(bytes, read, bytes.length - read, offset + read);
        if (!result.bytesRead) throw new Error("Render output ended before upload completed.");
        read += result.bytesRead;
      }
      const uploaded = await r2().send(new UploadPartCommand({ Bucket: R2_BUCKET, Key: objectKey, UploadId: uploadId, PartNumber: partNumber, Body: bytes }));
      if (!uploaded.ETag) throw new Error("R2 did not return an upload part ETag.");
      parts.push({ partNumber, etag: uploaded.ETag });
    }
    await completeMultipartUpload(objectKey, uploadId, parts);
    uploadId = null;
    return publicUrlFor(objectKey);
  } finally {
    if (uploadId) await abortMultipartUpload(objectKey, uploadId).catch(() => undefined);
    await file.close();
  }
}

// Reads a server-written object back as text. Only used for the render
// analysis blob, which is JSON the pipeline wrote itself — a missing or
// unreadable object returns null so the caller can fall back to a full run
// rather than failing the render.
export async function getObjectText(objectKey: string) {
  try {
    const result = await r2().send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: objectKey }));
    return (await result.Body?.transformToString()) ?? null;
  } catch {
    return null;
  }
}

// Reads a server-written object back as bytes. Like `getObjectText`, a missing
// object is null rather than an error — every caller so far treats "not cached"
// and "could not be read" the same way, by doing the work again.
export async function getObjectBytes(objectKey: string) {
  try {
    const result = await r2().send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: objectKey }));
    const bytes = await result.Body?.transformToByteArray();
    return bytes ? Buffer.from(bytes) : null;
  } catch {
    return null;
  }
}

const DOWNLOAD_CHUNK_BYTES = 16 * 1024 * 1024;
const DOWNLOAD_WORKERS = 6;
const DOWNLOAD_ATTEMPTS = 3;

// Parallel ranged GETs over the S3 endpoint. The public r2.dev URL is
// rate-limited by Cloudflare and ffmpeg reads it over one connection, which made
// "Downloading source" the slowest stage of a render.
export async function downloadObjectToFile(
  objectKey: string,
  destPath: string,
  { signal, onProgress }: { signal?: AbortSignal; onProgress?: (doneBytes: number, totalBytes: number) => void } = {}
) {
  const head = await r2().send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: objectKey }), { abortSignal: signal });
  const total = head.ContentLength ?? 0;
  const file = await open(destPath, "w");
  try {
    const starts = Array.from({ length: Math.ceil(total / DOWNLOAD_CHUNK_BYTES) }, (_, i) => i * DOWNLOAD_CHUNK_BYTES);
    const received = new Map<number, number>();
    const report = () => onProgress?.([...received.values()].reduce((sum, n) => sum + n, 0), total);
    let cursor = 0;
    const worker = async () => {
      while (cursor < starts.length) {
        const start = starts[cursor++];
        const end = Math.min(total, start + DOWNLOAD_CHUNK_BYTES) - 1;
        for (let attempt = 1; ; attempt++) {
          received.set(start, 0);
          try {
            const part = await r2().send(
              new GetObjectCommand({ Bucket: R2_BUCKET, Key: objectKey, Range: `bytes=${start}-${end}` }),
              { abortSignal: signal }
            );
            const chunks: Buffer[] = [];
            let length = 0;
            for await (const chunk of part.Body as Readable) {
              chunks.push(chunk as Buffer);
              length += (chunk as Buffer).length;
              received.set(start, length);
              report();
            }
            if (length !== end - start + 1) throw new Error(`Short read for bytes ${start}-${end}.`);
            await file.write(Buffer.concat(chunks, length), 0, length, start);
            break;
          } catch (error) {
            if (signal?.aborted || attempt >= DOWNLOAD_ATTEMPTS) throw error;
          }
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(DOWNLOAD_WORKERS, starts.length || 1) }, worker));
    report();
  } finally {
    await file.close();
  }
  return total;
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
