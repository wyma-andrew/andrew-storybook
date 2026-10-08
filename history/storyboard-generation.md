# Storyboard generation (full chapter)

Covers: `lib/storyboard-generation.ts`, the Generate / Stop toolbar button on
`app/(app)/(story)/stories/[id]/chapters/[chapterId]/storyboard/page.tsx`.

## 2026-10-06 — In-flight generation survives switching chapter tabs

Switching from Storyboard to Script or Assets unmounts the storyboard page. The
generate request kept running, but its `useWrite` `loading` flag died with the
page: coming back showed "Generate storyboard" again, nothing refetched when
the job finished, and a second click started a parallel generation.

**Decision:** the running job lives in a module-scope store keyed by chapter id
(`lib/storyboard-generation.ts`), read with `useSyncExternalStore`. It calls the
Spoosh `apiClient` directly because a hook's request state cannot outlive its
component. The page refetches scenes and voice-overs on any running → idle
transition it observes, so a remounted page refreshes even though a different
instance started the job. A second start for the same chapter is a no-op.

**Rejected:** a server-side "generating" column with polling. It would also
survive a full reload, but needs a migration and a stuck-flag recovery rule for
a crashed request. Not worth it until reload-survival is actually needed.

**Consequences:**

- A browser reload or closing the tab still loses the spinner. The server
  request may still finish and write the storyboard; reload again to see it.
- Stop aborts only the client request, as before. The route does not watch the
  abort signal, so the server may still finish and replace the storyboard.
- Single-scene regeneration (`regeneratingSceneId`) is still page state and does
  not survive a tab switch.
