# Governance

The project is one maintainer plus Claude sessions. Process exists to stop context being lost between sessions and branches, not to add ceremony. Keep every item below to the minimum that does that.

## 1. Lifecycle of a piece of work

1. **Idea** → add a node to [roadmap.json](roadmap/roadmap.json) with `status: "idea"`, dependencies and a rough effort.
2. **Spec** → for anything that touches data, privacy, networking or more than one platform, copy [specs/_template.md](specs/_template.md). Small UI changes skip this.
3. **Decision** → anything hard to reverse (storage format, backend, licence, public API) gets an ADR in [adr/](adr/) before code.
4. **Build** → on its own branch `feat/<name>`, one revertable commit per user-visible change. Roadmap node moves to `in-progress`.
5. **Ship** → merge to `main`; bump `package.json` + `VERSION`, add a CHANGELOG entry. Node moves to `done`.

## 2. Single sources of truth

- Status, order and dependencies: **only** `roadmap.json`. Do not repeat them in specs.
- Decisions: **only** ADRs. A spec links to its ADRs rather than restating them.
- Specs carry a `Status:` line (draft, agreed, built locally, shipped) and a date; update it when it changes.
- If two documents disagree, the newer dated one wins and the older gets fixed in the same commit.

## 3. Gates (a feature does not ship until these hold)

- **Privacy gate:** anything that sends data off-device is opt-in, off by default, listed in the spec's data table, and honours the kill switch. The README promise "nothing you read is ever sent anywhere" must stay true or be reworded in the same change.
- **Data gate:** any schema change has a migration, a pre-upgrade backup and a test. No change touches sync tables without the storage-and-sync spec being updated.
- **Licence gate:** third-party data (dictionaries, Shamela, fonts, audio) has its licence recorded in the spec. Licensed assets are never committed (see the Lotus font rule).
- **Test gate:** `npm run test:unit` and `npm run build` pass; user-facing flows have an e2e test or a written manual check.

## 4. Branches and releases

- `main` is releasable. Work happens on `feat/*`; long branches (like sync) merge `main` in regularly rather than all at the end.
- Bump the version per user-visible commit (see memory note on version bumps); the number appears in the app's Library notice.
- Keep unmerged-branch knowledge in the roadmap's `branch` field so nothing is only in someone's head.

## 5. Review

- Run `/code-review` on a branch before merge; `/security-review` for anything network, auth, or file-handling.
- Schema or sync changes also get a second read of the spec section they touch.

## 6. Cadence

- At the start of a session: open the roadmap site, pick the next node on the critical path unless there is a reason not to.
- At the end of a session: update node status and, if a decision was made, write the ADR. Five minutes, not an hour.
- Monthly: prune stale `idea` nodes, re-estimate effort, run the consolidate-memory skill.

## 7. Extension and community (future)

Plug-ins and shared content are governed by their own ADR before the plug-in API ships: permissions model, review process, versioning promise. Until then, nothing third-party runs inside the app.
