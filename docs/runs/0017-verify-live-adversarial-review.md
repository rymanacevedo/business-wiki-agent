# 0017: Verify live adversarial review

- **When**: 2026-10-18
- **Agent**: Codex
- **Driving**: [Spec: Clerk](https://github.com/rymanacevedo/business-wiki-agent/issues/15)

## Goal

Verify that independent adversarial reviewers are running while Claude implements the spec.

## What happened

Checked this session's agents, host process names, local review artifacts, and the integration handoff. The existing reviewers had completed their earlier prototype review; no review-wrapper lock was active. Recent inspected artifacts belonged to fake-executable tests, not live issue #15 reviews.

Started independent Standards and Spec reviewers using the local code-review skill. Both confirmed they were actively reviewing. The interim review pins `b4ba8ba..1491e40`, covering merged WikiStore (#16) and Corpus (#17) work against their acceptance criteria and the parent spec. Reviewers have read-only instructions and must not treat later tickets as missing requirements.

## Findings worth remembering

This starts native Codex subagent reviews; it does not invoke `codex exec`. The documented wrapper gate runs at final integration, not on every push. These interim reviewers do not automatically follow later commits or provide final approval.

Follow-up: clarified that these manually started reviewers have no automatic handoff or waiting relationship with the separate Claude run. Claude's actual live waiting state was not verified. Only a wrapper invocation made by Claude at its final integration step would synchronously wait for that review's result.

Inspected draft PR #31 after the human questioned its format. Its body explicitly defers Summary / Evidence / Merge Danger until ready for review. The local pr skill and integration handoff require the format whenever writing or updating a PR body, with no draft exemption. The omission is a workflow violation; no hook or remote check enforces this documentation requirement. Inspection only: did not edit the PR or send Claude a message.

## What the human checked

Requested live review verification. No review outcome has been approved by the human.

## Open questions

Review findings are pending. The completed implementation still needs the final integration review and exact-head status check.

## Artifacts

`/root/standards_review`, `/root/spec_review`; `docs/agents/integration-review.md`.
