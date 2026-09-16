# Continuation example

A complete, minimal SDD that a delivery which continues an unfinished predecessor would carry. It exists because three contract shapes had no worked instance anywhere: `lineage.mode: "continuation"` with its `predecessors`, a requirement's `deferred` metadata, and `environment_exceptions`. The values are a fixture, not evidence for any repository; the structure is what `validate-draft` accepts.

Read it beside the [loop-ready example](loop-ready-example.md), which carries the baseline contract this one extends.

## Worked continuation SDD

````markdown
# Input validation, continued

## Breaking Changes

**Applicability:** NOT_APPLICABLE

**Reason:** The entry signature and successful result are unchanged; only a previously unhandled negative value gains a defined rejection.

**Evidence:** The predecessor delivered the same entry and Result union; this continuation adds one branch inside it.

## New/Changed API & Typing

**Applicability:** APPLICABLE

**Signatures:**

```ts
type Request = { value?: number };
type Result = { ok: true; value: number } | { ok: false; error: "Invalid" };
function handle(request: Request): Result;
```

**Inputs and outputs:** A missing value already returns Invalid. A negative value now returns the same Invalid variant instead of publishing.

**Errors:** Invalid is returned as a Result; it is not thrown.

**Examples:**

```ts
handle({});           // { ok: false, error: "Invalid" }
handle({value: -1});  // { ok: false, error: "Invalid" }
handle({value: 7});   // { ok: true, value: 7 }
```

**Exports and consumers:** The existing handle entry remains exported; no generated declaration path changes.

## New/Changed Entities & Tools

**Applicability:** APPLICABLE

**Changes:** Extend the existing guard in the entry module. Add no helper, file or tool.

**Owners:** The entry module owns validation and publication, as it did in the predecessor.

**Lifecycle:** Call-local. A rejected request must not overwrite the previously published value.

**Dependencies:** None added.

**Reuse evidence:** The predecessor's guard and Invalid variant already exist; this extends that branch rather than introducing a second validator.

## Implementation Flow & Pseudocode

**Applicability:** APPLICABLE

**Entry points:** Only handle changes.

**Ordered flow:** LJ01 keeps the predecessor's validate-then-publish path. LJ02 adds the negative rejection, and its input binds LJ01's output.

**Data and state:** request -> validated -> result -> rejection. The published slot is written once, by LJ01.

**Step coverage:** LJ01 contains BZ01 and BZ02 for XQ01/YS01; LJ02 contains BZ03 for XQ02/YS02.

## Delivery & Verification

**Applicability:** APPLICABLE

**Batches and dependencies:** PC01 carries both requirements. XQ02 is deferred by owner and trigger, not removed: a requirement that is not a non-goal still belongs to a batch, and the controller reports DELIVERY_PLAN_REQUIREMENT_COVERAGE_INCOMPLETE when a plan omits one.

**Exit conditions:** Missing input and negative input both preserve the prior state; value 7 publishes 7.

**Acceptance:** YS01 observes the missing-input path, YS02 the negative path. MJ01 requires final independent verification of both.

**Executed probes:** This is an isolated documentation fixture, not production execution evidence.

## BZ01 Validate input

**Kind:** BEHAVIOR

**Location:** Proposed src/entry.ts: handle body

**Owner:** The handle entry module

**Inputs and types:** request: Request from ENTRY

**Preconditions:** Request has been supplied by the existing caller

**Calls:** No helper call; use the local guard

**Pseudocode:**

```text
if request.value is absent: return Invalid; validated = request.value
```

**State changes:** None before validation

**Failure:** Return Invalid before mutating the result

**Lifecycle and recovery:** Synchronous call-local flow; rejection preserves the previous slot

**Observable result:** Missing value returns Invalid without publication

## BZ02 Publish result

**Kind:** BEHAVIOR

**Location:** Proposed src/entry.ts: handle body

**Owner:** The handle entry module

**Inputs and types:** validated: number from BZ01

**Preconditions:** BZ01 returned validated rather than Invalid

**Calls:** Assign the existing local result slot

**Pseudocode:**

```text
result = validated; return result
```

**State changes:** Publish the validated value once

**Failure:** A local assignment has no fallible external operation

**Lifecycle and recovery:** Synchronous call-local flow; no acquired resource

**Observable result:** Valid input returns and publishes the supplied value

## BZ03 Reject a negative value

**Kind:** BEHAVIOR

**Location:** Proposed src/entry.ts: handle body, immediately after BZ01

**Owner:** The handle entry module

**Inputs and types:** validated: number produced by LJ01

**Preconditions:** BZ01 accepted the request, so a number is in hand

**Calls:** No helper call; extend the same local guard

**Pseudocode:**

```text
if validated < 0: return Invalid
```

**State changes:** None; the rejection returns before BZ02 publishes

**Failure:** A comparison has no fallible external operation

**Lifecycle and recovery:** Synchronous call-local flow; the previously published value is untouched

**Observable result:** A negative value returns Invalid and leaves the prior result unchanged; YS02 observes it

# Continuation example SDD

## 交付事项

| ID | description | requirement_ids | acceptance_ids | batch_ids | gate |
| --- | --- | --- | --- | --- | --- |
| PC01 | Validate input and reject a negative value | XQ01,XQ02 | YS01,YS02 | | |
| BH01 | Close the negative-value branch | XQ02 | YS02 | PC01 | |
| MJ01 | Complete final independent acceptance | XQ01,XQ02 | YS01,YS02 | | SHIP |

<!-- sdd-contract:start -->
```json
{
  "protocol": "sdd-loop-delivery/v1",
  "revision": "SDD-v1",
  "objective": "Finish the predecessor deliverys last guard and record what it deferred",
  "implementation_logic": {
    "protocol": "implementation-logic/v1",
    "paths": [
      {
        "id": "LJ01",
        "requirement_ids": [
          "XQ01"
        ],
        "acceptance_ids": [
          "YS01"
        ],
        "inputs": [
          {
            "name": "request",
            "source": "ENTRY",
            "evidence": [
              "fixture caller supplies request"
            ]
          }
        ],
        "steps": [
          {
            "id": "BZ01",
            "requires": [
              "request"
            ],
            "produces": [
              "validated"
            ],
            "source": {
              "document": "self",
              "heading": "BZ01 Validate input"
            }
          },
          {
            "id": "BZ02",
            "requires": [
              "validated"
            ],
            "produces": [
              "result"
            ],
            "source": {
              "document": "self",
              "heading": "BZ02 Publish result"
            }
          }
        ],
        "outputs": [
          "result"
        ],
        "challenges": [
          {
            "premise": "Invalid input cannot publish a result",
            "method": "run fixture with missing value",
            "failure_condition": "result changes on invalid input",
            "observed_result": "Invalid returned; result unchanged",
            "implementation_resolution": "VALIDATE precedes COMMIT; invalid branch returns before assignment",
            "result": "CLOSED",
            "evidence": [
              "fixture negative input trace"
            ]
          }
        ]
      },
      {
        "id": "LJ02",
        "requirement_ids": [
          "XQ02"
        ],
        "acceptance_ids": [
          "YS02"
        ],
        "inputs": [
          {
            "name": "validated",
            "source": {
              "path": "LJ01",
              "output": "result"
            }
          }
        ],
        "steps": [
          {
            "id": "BZ03",
            "requires": [
              "validated"
            ],
            "produces": [
              "rejection"
            ],
            "source": {
              "document": "self",
              "heading": "BZ03 Reject a negative value"
            }
          }
        ],
        "outputs": [
          "rejection"
        ],
        "challenges": [
          {
            "premise": "A deferred requirement still has to be planned",
            "method": "Place XQ02 in the same batch and shard as XQ01",
            "failure_condition": "The plan omits a requirement that is not a non-goal",
            "observed_result": "DELIVERY_PLAN_REQUIREMENT_COVERAGE_INCOMPLETE names it when omitted",
            "implementation_resolution": "Deferral records who owns the wait; it never removes the requirement from the plan",
            "result": "CLOSED",
            "evidence": [
              "controller diagnostic for an unplanned requirement"
            ]
          }
        ]
      }
    ]
  },
  "delivery_plan": {
    "protocol": "delivery-plan/v1",
    "batches": [
      {
        "id": "PC01",
        "lane": "core",
        "requirement_ids": [
          "XQ01",
          "XQ02"
        ],
        "acceptance_ids": [
          "YS01",
          "YS02"
        ],
        "modification_packages": [
          "@demo/core"
        ],
        "depends_on": [],
        "estimated_minutes": 25,
        "test_budget": {
          "minutes": 5,
          "max_new_test_files": 0
        }
      }
    ],
    "final_verification_shards": [
      {
        "id": "FV01",
        "acceptance_ids": [
          "YS01",
          "YS02"
        ]
      }
    ]
  },
  "migration_applicability": "NOT_APPLICABLE",
  "design_convergence": {
    "status": "CONVERGED",
    "unresolved_information_questions": [],
    "pending_authority_confirmations": [],
    "route_critical_unknowns": [],
    "blocking_findings": [],
    "material_findings": [],
    "stable_after_last_normative_change": true,
    "review_passes": [
      {
        "id": "SP01",
        "lens": "SYNTHESIS",
        "result": "PASS",
        "evidence": "design basis"
      },
      {
        "id": "SP02",
        "lens": "ADVERSARIAL",
        "result": "PASS",
        "evidence": "boundary review"
      },
      {
        "id": "SP03",
        "lens": "ACCEPTANCE_TOPOLOGY",
        "result": "PASS",
        "evidence": "failure isolation"
      }
    ]
  },
  "lineage": {
    "mode": "continuation",
    "basis": [
      "Predecessor delivery stopped after its first batch"
    ],
    "predecessors": [
      {
        "sdd": "input-validation-round1.sdd.md",
        "relation": "delivery-predecessor"
      }
    ]
  },
  "ownership": {
    "product": "demo",
    "packages": [
      "@demo/core"
    ],
    "approval_authority": "user"
  },
  "inventory_authorities": {
    "SOURCE_INVENTORY": {
      "roots": [
        "packages/demo/src",
        "packages/demo/package.json"
      ],
      "method": "Read manifests, exports, and source reader edges",
      "evidence": [
        "current source inventory"
      ]
    },
    "RUNTIME_RESOLUTION": {
      "applicability": "NOT_APPLICABLE",
      "reason": "The acceptance does not depend on installed resolution"
    }
  },
  "requirements": [
    {
      "id": "XQ01",
      "title": "Main path",
      "kind": "must-ship",
      "status": "pending",
      "dependencies": [],
      "acceptance": [
        "YS01"
      ]
    },
    {
      "id": "XQ02",
      "title": "Reject a negative value",
      "kind": "must-ship",
      "status": "pending",
      "dependencies": [
        "XQ01"
      ],
      "acceptance": [
        "YS02"
      ],
      "deferred": {
        "owner": "unassigned",
        "trigger": "a second caller needs the same rejection",
        "impact": "XQ01 keeps its behavior; only the negative branch waits",
        "approved_by": "user"
      }
    }
  ],
  "acceptance": [
    {
      "id": "YS01",
      "requirement_ids": [
        "XQ01"
      ],
      "oracle": "returns the expected result",
      "claim": {
        "id": "DL01",
        "statement": "The supported runtime returns the expected result",
        "dimension": "BEHAVIOR",
        "quantifier": "SINGLE"
      },
      "method": "pnpm --filter @demo/core test",
      "environment": "supported runtime",
      "packages": [
        "@demo/core"
      ],
      "execution": {
        "isolation": "INDEPENDENT",
        "timeout_seconds": 60,
        "readiness_oracle": "The supported runtime reports the result",
        "state_boundary": "Fresh package test process",
        "evidence_boundary": "AC-1 has its own test result",
        "blocking_acceptance_ids": []
      },
      "oracle_sensitivity": {
        "applicability": "NOT_APPLICABLE",
        "reason": "Positive business behavior without a negative guard"
      }
    },
    {
      "id": "YS02",
      "requirement_ids": [
        "XQ02"
      ],
      "oracle": "a negative value returns Invalid",
      "claim": {
        "id": "DL02",
        "statement": "The supported runtime rejects a negative value",
        "dimension": "BEHAVIOR",
        "quantifier": "SINGLE"
      },
      "method": "pnpm --filter @demo/core test -- --grep negative",
      "environment": "supported runtime",
      "packages": [
        "@demo/core"
      ],
      "execution": {
        "isolation": "INDEPENDENT",
        "timeout_seconds": 60,
        "readiness_oracle": "The supported runtime reports the result",
        "state_boundary": "Fresh package test process",
        "evidence_boundary": "YS02 has its own test result",
        "blocking_acceptance_ids": []
      },
      "oracle_sensitivity": {
        "applicability": "NOT_APPLICABLE",
        "reason": "Positive business behavior without a negative guard"
      }
    }
  ],
  "document_policy": "sdd-document/v1",
  "presentation": {
    "protocol": "sdd-presentation/v1",
    "items": [
      {
        "id": "PC01",
        "kind": "batch",
        "source": {
          "document": "self",
          "heading": "交付事项",
          "table": 1
        }
      },
      {
        "id": "BH01",
        "kind": "closure",
        "source": {
          "document": "self",
          "heading": "交付事项",
          "table": 1
        }
      },
      {
        "id": "MJ01",
        "kind": "gate",
        "source": {
          "document": "self",
          "heading": "交付事项",
          "table": 1
        }
      }
    ]
  },
  "design_detail": {
    "protocol": "design-detail/v1",
    "sections": {
      "breaking_changes": {
        "document": "self",
        "heading": "Breaking Changes"
      },
      "api_typing": {
        "document": "self",
        "heading": "New/Changed API & Typing"
      },
      "entities_tools": {
        "document": "self",
        "heading": "New/Changed Entities & Tools"
      },
      "implementation_flow": {
        "document": "self",
        "heading": "Implementation Flow & Pseudocode"
      },
      "delivery_verification": {
        "document": "self",
        "heading": "Delivery & Verification"
      }
    }
  },
  "environment_exceptions": [
    {
      "tool": "node",
      "reason": "the acceptance asserts a returned value, never a runtime version"
    }
  ]
}
```
<!-- sdd-contract:end -->

````

Reading it back:

- **`lineage.mode`** is `continuation` only when this SDD finishes a delivery that stopped. Each `predecessors` entry names that contract by a repository-relative `.md` path and the relation `delivery-predecessor`; a shipped authority or a merely related project belongs in `lineage.basis`, never here. Lineage is immutable after initialization.
- **`deferred`** carries all four of `owner`, `trigger`, `impact` and `approved_by`. `owner` may be `unassigned`, but the other three are always concrete, and a `must-ship` deferral requires `approved_by: "user"` — the controller rejects any other value with `MUST_SHIP_DEFERRAL_REQUIRES_USER`.
- Deferral records **who owns the wait, not an exemption from the plan**. `XQ02` still belongs to `PC01`: every requirement that is not a `non-goal` must land in a batch, and the controller reports `DELIVERY_PLAN_REQUIREMENT_COVERAGE_INCOMPLETE` when one does not.
- **`environment_exceptions`** names a tool whose repository pin the acceptance deliberately does not assert, with the reason. `repo-facts.ts check` compares acceptance runtimes against the repository's pins and uses this list to explain a difference it would otherwise report.

Write every fenced block with its opening fence on its own line. A field written as `**Signatures:** ` followed by an inline opening fence leaves the scanner one unmatched fence line, which silently shifts what counts as prose and can hide the contract markers entirely.

<!-- reading-receipt: 93ac6a5f -->
