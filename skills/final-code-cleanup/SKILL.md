---
name: final-code-cleanup
description: Final simplification pass over an implementation or task diff, including against a specified branch/ref. Minimize human cognitive load and unnecessary code through reuse while preserving requirements and safeguards.
disable-model-invocation: false
---
# Final Code Cleanup

Run one final pass after implementation and primary verification, or over completed task changes selected by the user. Apply safe simplifications before presenting the result; do not stop at recommendations. The first code shown to the human must already include this pass.

Optimize for the smallest complete, clear change that satisfies the task and is easy and fast for a human to understand. Make minimality a first-pass constraint, not something to defer to this final pass: before the first edit, derive the required behavior and necessary invariants, identify the narrowest existing path, and challenge the design against materially smaller viable alternatives. Implement the smallest clear, complete design that meets the current contract. Add scope, files, branches, configuration, or behavior only when required by the current contract or a necessary invariant; use abstractions only when they serve current behavior, protect an invariant, or reduce the human mental model. Reject speculative future behavior. Never omit contract-required validation, tests, documentation, or safeguards to reduce the diff. Correctness and explicit requirements are hard constraints. Minimize the mental model before minimizing lines; never trade correctness or human cognitive simplicity for brevity.

## Contract, scope, and safety

- Recover the current requirements, constraints, invariants, and existing behavior from available context and code. Reread only what is missing or ambiguous.
- Identify the task's changes. When the user supplies a branch/ref, use it as a read-only comparison baseline; never change Git state. Separate task edits from pre-existing work, even within the same diff. Resolve an unclear task boundary before editing.
- Keep edits surgical and confined to the task. Unchanged code is context, not a general cleanup target. Leave unrelated bugs, hardening, refactoring, and formatting untouched. A beneficial change is not necessarily an in-scope change.
- Judge necessity against the request and baseline, not incidental behavior the implementation added. Regardless of author, treat the implementation as a candidate, not an approved design: re-derive the smallest complete approach from requirements and invariants, replacing overbuilt scope rather than limiting this pass to local simplifications or treating draft additions as requirements.
- Preserve required behavior and safeguards: correctness, security, data integrity, validation, error handling, resource cleanup, ordering, boundary behavior, ownership, lifecycle, compatibility, and required performance. This safety floor does not authorize unrelated improvements.

## Integrated review

Use these established concepts as qualitative lenses, not numerical working-memory limits or metric targets. Review the changed implementation as a whole; moving complexity elsewhere is not simplification.

### 1. Challenge necessity and prefer reuse

**Adversarial Minimality; YAGNI; KISS; Occam's razor; Principle of least astonishment.**

For each material changed element, ask in order:

1. Does this need to exist for a current requirement or necessary invariant?
2. Can existing project functionality do this, directly or through a narrow local extension?
3. Can the standard library or platform already do this?
4. Can the same requirement use fewer independent concepts and relationships?
5. Can it use fewer layers, boundaries, or mental jumps?
6. Only then: can it use fewer lines without making understanding harder?

Prefer existing mechanisms, established helpers, and supported standard facilities over custom replacements. Confirm their contracts and behavior match, including failure and ownership semantics; reuse must not merely hide a mismatch behind another wrapper.

Question single-use helpers, wrappers with no added behavior, interfaces with one implementation, speculative parameters or configuration, unnecessary types or dependencies, premature generalization, and custom code that reinvents a standard facility. These are candidates, not automatic deletions: retain a helper or boundary when it genuinely reduces the mental model or protects a necessary invariant. Reject hypothetical future requirements, speculative extension points, and abstractions added "just in case."

### 2. Reduce the human mental model

**Working memory and chunking — Miller, Cowan, Chase & Simon, Ericsson & Kintsch; Cognitive load; Local reasoning.**

Minimize independent concepts, relationships, hidden state, and context the reader must hold simultaneously. Keep related logic close together, data flow direct, state visible, and behavior traceable. Prefer familiar names and patterns that readers can already chunk.

Reduce indirection, abstraction layers, and jumps between files, functions, or types. Small local repetition can be clearer than a new abstraction. Do not inline a useful helper or compress expressions merely to shorten the code if doing so enlarges the mental model.

### 3. Simplify control flow

**McCabe cyclomatic complexity; Essential complexity; Cognitive Complexity.**

Prefer simple branching, shallow nesting, direct execution paths, and few state transitions. Remove unnecessary paths and state rather than moving branches into helpers to improve a score. Preserve required execution and failure ordering.

Do not optimize metrics blindly: a clear structure can have a high value, and a tangled structure can have a low value. Choose the structure a human can trace most easily.

### 4. Make boundaries earn their place

**Information hiding — Parnas; Local reasoning; Coupling; Cohesion.**

Keep implementation details, representations, and changeable decisions local. Keep related behavior together and interfaces minimal. A useful boundary reduces what the reader must know across it and hides details without obscuring the required contract.

Remove boundaries that add more concepts than they hide. Avoid premature separation of concerns that forces readers to understand unrelated components. Do not unnecessarily expose mutable state, ownership, lifecycle, or error-handling details. Neither maximal abstraction nor maximal inlining is the goal; minimize the total knowledge needed to understand the task's behavior.

## Apply, verify, and finish

- Make safe, concise edits directly, reusing existing mechanisms and preserving surrounding behavior and formatting. Remove task-added imports, parameters, helpers, and other code made dead by these simplifications; do not sweep unrelated code.
- Trace success, failure, cleanup, ordering, and edge paths after editing. Check that the simplified implementation still satisfies the contract and preserves required safeguards. If a proposed simplification's safety cannot be established, keep the working version and report any material unresolved ambiguity.
- Inspect the final task diff against the requirements and baseline. Remove your accidental or whitespace-only edits without disturbing pre-existing work. Perform only affected checks permitted by the active verification policy; this skill grants no additional execution permission.
- Stop when every retained changed element serves a current requirement, preserves a necessary invariant, or reduces present human cognitive load within the task, and further removal would break the contract or enlarge the mental model. Do not restart broad cleanup looking for unrelated improvements.
- Report only material simplifications, changed paths, actual verification, and unresolved risks. Never imply an unrun check passed. Do not emit a lens-by-lens review or metric scorecard unless asked.
