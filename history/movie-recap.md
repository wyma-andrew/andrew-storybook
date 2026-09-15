# Movie Recap

Covers: `app/(app)/(movie-recap)/movie-recap/**`,
`app/api/(movie-recap)/movie-recaps/**`, `components/movie-recap/**`,
`lib/constants/movie-recap.ts`, `lib/movie-recap.ts`, `lib/r2.ts`,
`lib/spoosh.ts`, and the `movie_recap_projects` migration.

## 2026-09-14 — Phase one is a resumable configuration project, not a render job

**Decision:** Movie Recap starts with a project dashboard and a persisted
four-step editor: source, settings, customization, and review. Clicking
Generate only marks the configuration `ready_for_generation`; phase one does
not manufacture a job, fake progress, or an output URL.

**Why:** the requested processing pipeline is explicitly phase two. A durable
ready state is the smallest honest handoff for that pipeline and lets users
reopen or edit the configuration now. Any later edit demotes the project back
to `draft`, so phase two cannot mistake stale settings for approved ones.

The one code-defined voice is `narrator`, with a stable preview at
`public/movie-recap/voices/narrator.mp3`. Output language is Burmese only.
Aspect ratio, subtitle mode, logo placement/opacity, normalized blur geometry,
and the deferred copyright-free boolean live on the project row.

## 2026-09-14 — Movie sources use R2 multipart upload with same-file reselection

**Decision:** videos upload browser-to-R2 in multipart chunks with three
workers. The database stores the active upload id; reopening lists completed
R2 parts, then asks the user to reselect a file with the same name, byte size,
and last-modified value. Failed parts receive a fresh signed URL and retry;
completed parts are not sent again.

**Why:** Cloudflare recommends multipart upload for video and other large
objects. Keeping the `File` itself across a browser restart would duplicate a
potentially huge movie into IndexedDB or depend on browser-specific file-handle
permissions. Reselection preserves server progress without either cost.

Upload progress uses `XMLHttpRequest.upload`; Fetch exposes no outbound upload
progress. Direct R2 requests are the same deliberate exception recorded for
chapter-image uploads: Spoosh owns calls to this app, not presigned third-party
storage URLs. App API calls still all use Spoosh.

**Accepted consequence:** the existing public R2 bucket was explicitly chosen
over a separate private bucket. Source and logo URLs are therefore public to
anyone who obtains them. Keys include project and random identifiers, but that
is obscurity, not authorization.

**Rejected:** one large PUT. It is simpler, but a network failure restarts the
whole movie and R2 recommends multipart for this workload. Also rejected:
persisting the video Blob in browser storage for transparent resume.

## 2026-09-14 — Preview edits are normalized configuration only

Aspect ratio changes the centered `object-cover` preview; subtitle mode shows a
fixed safe-area placeholder only for styled subtitles. Logo position uses four
corners. Blur is a normalized percentage rectangle clamped inside the selected
frame and supports pointer drag plus keyboard nudging. Actual crop, subtitle,
logo, blur, copyright transformation, and rendering remain phase two work.

GeckoUI 1.6.3 has no Slider. The opacity/width/height controls are an explicitly
approved narrow exception: accessible native range inputs styled with Tailwind
tokens. Other visible form controls remain GeckoUI components.

## 2026-09-15 — Upload failures are traceable without exposing upload grants

The browser upload flow emits structured console events prefixed with
`[MovieRecapUpload]` for file metadata, project/resume state, multipart sizing,
part attempts, retries, completion, and the final stopped reason. Logs include
part numbers and non-secret file metadata, but deliberately omit presigned R2
URLs and ETags because both are upload credentials or completion tokens.
