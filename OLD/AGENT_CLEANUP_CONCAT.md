# AGENTS.md
 
## Coding
 
Optimise every implementation for the human's limited working memory.
 
Correctness and explicit requirements are hard constraints.
 
Before you show any code:
 
1. Understand the requirements.
2. Apply the relevant minimality skills.
3. Verify correctness.
4. Output the result.
 
The first output must already be the simplest correct solution.
 
Do not trade human cognitive simplicity for fewer lines.
Do not trade correctness for fewer lines.
AGENTS.md
AGENTS.md is a simple, open format for guiding coding agents. Think of it as a README for agents.
 
# Working Memory
 
## Purpose
 
Minimise the human mental model required to understand and change the code.
 
## Conceptual anchors
 
Use the established ideas associated with:
 
- Working memory and chunking — Miller, Cowan, Chase & Simon, Ericsson & Kintsch
- Cognitive load
- Local reasoning
 
These are lenses, not numerical limits.
 
## Core rule
 
Minimise the independent concepts, relationships, and mental jumps the human must track.
 
## Prefer
 
- Related logic kept close together
- Direct data flow
- Visible state
- Traceable behaviour
- Familiar patterns that experts already chunk
 
## Minimise
 
- New concepts
- New relationships
- Indirection
- Abstraction layers
- Hidden state
- Mental jumps between files, functions, or types
 
## Constraint
 
Do not make code shorter if the shorter version requires a larger mental model.
 
# Control Flow
 
## Purpose
 
Minimise unnecessary control-flow complexity.
 
## Conceptual anchors
 
Use the established ideas associated with:
 
- McCabe cyclomatic complexity
- Essential complexity
- Cognitive Complexity
 
These are lenses, not hard targets.
 
## Prefer
 
- Simple branching
- Shallow nesting
- Direct execution paths
- Few state transitions
 
## Constraint
 
Do not optimise the metric blindly.
 
A clear structure can have a high metric value.
A tangled structure can have a low metric value.
 
# Information Hiding
 
## Purpose
 
Minimise the knowledge the human must understand across a boundary.
 
## Conceptual anchors
 
Use the established ideas associated with:
 
- Information hiding — Parnas
- Local reasoning
- Coupling
- Cohesion
 
These are lenses, not hard targets.
 
## Prefer
 
- Implementation details kept local
- Boundaries that reduce the overall mental model
- Related behaviour kept together
 
## Avoid
 
- Boundaries that force the human to understand unrelated components
- Premature separation of concerns that increases total concepts
 
# YAGNI
 
## Purpose
 
Implement only current requirements.
 
## Conceptual anchors
 
Use the established ideas associated with:
 
- YAGNI
- KISS
- Occam's razor
- Principle of least astonishment
 
These are lenses, not hard targets.
 
## Core rule
 
Do not implement hypothetical future requirements.
 
## Avoid
 
- Speculative configuration
- Speculative extension points
- Premature generalisation
- Abstraction added “just in case”
 
Every additional capability must either satisfy a current requirement or reduce real complexity for the human.
 
# Adversarial Minimality
 
## Purpose
 
Find what can disappear without increasing human cognitive load or breaking a requirement.
 
## Process
 
Before the first output, examine the implementation and ask:
 
1. Does this need to exist?
2. Can existing code already do this?
3. Can the standard library or platform already do this?
4. Can the same requirement use fewer concepts?
5. Can the same requirement use fewer layers?
6. Can the same requirement use fewer lines?
 
## Look for
 
- Single-use helpers
- Wrappers with no added behaviour
- Interfaces with one implementation
- Speculative parameters
- Premature generalisation
- Unnecessary types, configuration, or dependencies
- Custom code that reinvents a standard facility
 
## Safety floor
 
Never remove behaviour required for correctness, security, data integrity, explicit requirements, required error handling, required validation, or required performance.
 
## Final check
 
The first code shown to the human must already be the result of this process.
 
