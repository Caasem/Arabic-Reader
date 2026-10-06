# ADR 0001: Record costly decisions as ADRs

Status: accepted
Date: 2026-10-06

## Context
The project spans several platforms, branches and Claude sessions. Decisions made in chat are lost, and later sessions re-litigate them.

## Decision
Any decision that is expensive to reverse gets a short ADR in `docs/adr/`, numbered in order and never edited except for its status line. A change of mind is a new ADR that supersedes the old one.

## Consequences
A few minutes per decision; a searchable history of why. Specs link to ADRs instead of restating them.

## Alternatives considered
Keeping decisions inside specs: they drift and get edited silently.
