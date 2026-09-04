---
name: final-code-cleanup
description: Final post-implementation review that removes unnecessary complexity while preserving required behavior and safeguards.
disable-model-invocation: true
---
# Final Code Cleanup

Run exactly once after implementation and primary verification. Make the safe cleanup edits before presenting the result. Optimize for the smallest complete, clear change—not the fewest lines or a metric score.

Use working-memory and local-reasoning principles, control-flow complexity, information hiding and cohesion, YAGNI/KISS, and adversarial minimality as qualitative lenses.

## Review

1. **Recover the contract.** Use the current request, established project rules, and changed code. Reread only information missing from context or made ambiguous by the diff. Separate task changes from pre-existing work.
2. **Protect invariants.** Preserve correctness, security, data integrity, validation, errors, cleanup, ordering, boundary behavior, ownership, lifecycle, compatibility, and required performance. Tests are evidence, not the whole contract.
3. **Challenge necessity.** For each material changed element, ask whether a current requirement needs it, existing code or the platform already provides it, or removing it would break an invariant. Remove speculative, redundant, and dead elements.
4. **Reduce the mental model.** Prefer direct data flow, explicit state, related logic kept together, familiar patterns, shallow nesting, and few transitions or cross-file jumps. Small local repetition is better than indirection when it is easier to follow. Never shorten code if comprehension worsens.
5. **Check boundaries.** Keep representation and changing decisions local, interfaces minimal, cohesion high, and coupling low. Do not introduce a boundary that increases total concepts or leak mutable state, ownership, lifecycle, or error details unnecessarily.
6. **Trace behavior.** After cleanup, recheck success, failure, cleanup, ordering, and edge paths. If safety cannot be established, keep the code or ask about the concrete ambiguity.

## Apply and finish

- Make safe cleanup edits directly; preserve unrelated behavior and formatting.
- Remove imports, dependencies, configuration, and code made dead by cleanup.
- Inspect the final relevant diff against the request and invariants, then rerun only checks affected by cleanup under the active verification policy.
- Do not emit a lens-by-lens review unless asked. Report only material changes, unresolved risks, and actual verification.
- Stop when every retained changed element serves a current requirement or reduces present complexity, and further deletion would break an invariant or enlarge the mental model.
