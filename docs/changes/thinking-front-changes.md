# Thinking desk: change matrix

Every change made for the thinking desk ([spec](../features/thinking-front.md)), one row per phase. Each phase is one
commit. To remove a phase, revert its commit (`git revert <sha>`); later phases build on earlier ones, so revert from the
bottom up. To switch the whole feature off without code changes, turn off Settings → Reading → Thinking desk
(`thinkingFrontEnabled`, off by default); each part also has its own switch there.

New code lives in `src/thinking/` (the feature: hosts, screens, pure logic) and, for data, in `src/studyDesk/`. Edits to
existing files are listed per phase and kept to the lines named. Everything in `src/thinking/` loads on demand, so the
entry bundle only gains the feature descriptor and the small extension points.

| Phase | Version | What it adds | New files | Existing files touched | Switch | Revert notes |
|---|---|---|---|---|---|---|
| Spec | — | This file, the spec, the roadmap item | `docs/features/thinking-front.md`, this file | `docs/roadmap/roadmap.json` (one item) | — | Docs only. |
