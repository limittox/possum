# Possum Dogfooding Notes

## 2026-07-01 rich-interface-chat-poc

Target repo: `/home/yathu/code/rich-interface-chat-poc`

Branch: `possum-testing`

Intentional regression: the DiffusionGemma compare panel was wrapped with `rotate-2 opacity-45 blur-[1px]` in `app/compare/page.tsx`.

Observed issues:

- Port `4190` is blocked by browser/fetch security, so Node `fetch()` fails with `bad port` before it reaches the app.
- Possum supports both useful app modes: omit `--command` to audit an already-running app, or pass `--command` when Possum should start and stop the app itself.
- The successful end-to-end run used `--command "PORT=4311 npm start" --url http://localhost:4311/compare`.
- The generated screenshot showed the visual regression, but Possum did not report it as a visual finding.
- A disabled-submit failure from the impatient persona was reported as a beginner access finding, which points to over-broad failure classification.

Fix order:

1. Make startup and reachability errors clear, including browser-blocked ports.
2. Restrict beginner access findings to true startup or first-page reachability failures.
3. Generate repro specs with the actual failing persona actions.
4. Make the impatient form probe fill required fields or skip disabled submits without noisy findings.
5. Add a visual QA pass for obvious screenshot/style defects such as blur, low opacity, transforms, overlap, clipping, and unreadable text.
