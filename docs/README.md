# Documentation map

| Where | What lives there | Changes when |
|---|---|---|
| [README.md](../README.md) | What the app is, for users | A user-visible feature ships |
| [CHANGELOG.md](../CHANGELOG.md) | One entry per release | Every user-visible commit (see [governance](governance.md)) |
| [governance.md](governance.md) | How work is proposed, decided, built, shipped | The process itself changes |
| [roadmap/](roadmap/) | `roadmap.json` (single source of truth) and the local tracking site | Status, scope or dependencies move |
| [specs/](specs/), start with [data-architecture.md](specs/data-architecture.md) | One spec per feature: what and why, before building | Before a feature starts; status line updated as it progresses |
| [features/](features/) | One standalone spec and copy-paste development prompt per roadmap item | When an item is planned, built, or its behaviour changes |
| [adr/](adr/) | One short record per decision that is costly to reverse | A decision is made or superseded |

Rule of thumb: **feature specs say what each item does and how to build it, design specs go deeper on large systems, ADRs say what we decided and why, the roadmap says when and in what order, the changelog says what shipped.**

Open the roadmap site with `npm run roadmap`, then http://localhost:4177.
