# Shared mechanism example

A complete, minimal SDD for work that edits a dependency manifest and whose two acceptance cases share one install directory. It exists because four contract shapes had no worked instance: `shared_mechanism_writes`, `execution.isolation: "SHARED_SAFE"` with `failure_containment`, `execution.consumes`, and `execution.timeout_reason`.

The values are a fixture. Read it beside the [loop-ready example](loop-ready-example.md) for the baseline contract, [artifacts and dependencies](../design/artifacts-and-dependencies.md) for when a dependency operation is admissible at all, and [test budget](../planning/test-budget.md) for what raises a batch budget.

## Worked shared-mechanism SDD

````markdown
# Input validation design

## Breaking Changes

**Applicability:** NOT_APPLICABLE

**Reason:** The entry signature and successful result remain unchanged; missing input already returns Invalid.

**Evidence:** The isolated example entry below and its before/after acceptance specify the same public contract.

## New/Changed API & Typing

**Applicability:** APPLICABLE

**Signatures:**

```ts
type Request = { value?: number };
type Result = { ok: true; value: number } | { ok: false; error: "Invalid" };
function handle(request: Request): Result;
```

**Inputs and outputs:** A Request enters handle. Missing value returns Invalid; a present number produces the same value.

**Errors:** Invalid is returned as a Result; it is not thrown.

**Examples:**

```ts
handle({}); // { ok: false, error: "Invalid" }
handle({value: 7}); // { ok: true, value: 7 }
```

**Exports and consumers:** The existing handle entry remains exported; callers retain the Result union. No generated declaration path is added.

## New/Changed Entities & Tools

**Applicability:** APPLICABLE

**Changes:** Modify the handle implementation; retain Request and Result. Add no helper or tool.

**Owners:** The entry module owns validation and publishes the result.

**Lifecycle:** The request is call-local. Invalid input must not overwrite the prior published value.

**Dependencies:** No new dependency; the two ordered steps share the entry module.

**Reuse evidence:** Use the existing result slot and Invalid variant from this isolated contract; do not introduce another registry.

## Implementation Flow & Pseudocode

**Applicability:** APPLICABLE

**Entry points:** Only handle changes; no alternate setter is introduced.

**Ordered flow:** BZ01 validates the request, then BZ02 publishes the value. A rejection exits before BZ02.

**Data and state:** request -> validated -> result. Publishing changes only the existing result slot.

**Step coverage:** LJ01 contains BZ01 and BZ02, covering XQ01 and YS01.

## Delivery & Verification

**Applicability:** APPLICABLE

**Batches and dependencies:** PC01 performs BZ01 then BZ02; no dependency installation is needed.

**Exit conditions:** Missing input preserves prior state; value 7 publishes 7 and returns success.

**Acceptance:** YS01 checks invalid and valid calls independently; MJ01 requires final independent verification.

**Executed probes:** This is an isolated validation fixture, not production execution evidence. Its CLI tests validate document structure; semantic behavior is specified above.

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

**Lifecycle and recovery:** Synchronous call-local flow; no await, cancellation or acquired resource. Rejection preserves the previous slot.

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

**Lifecycle and recovery:** Synchronous call-local flow; no await, cancellation or acquired resource. Rejection preserves the previous slot.

**Observable result:** Valid input returns and publishes the supplied value; YS01 observes both paths

# Shared mechanism example SDD

## 交付事项

| ID | description | requirement_ids | acceptance_ids | batch_ids | gate |
| --- | --- | --- | --- | --- | --- |
| PC01 | Add the dependency and prove the built bundle loads | XQ01 | YS01,YS02 | | |
| BH01 | Close the packed-consumer load path | XQ01 | YS02 | PC01 | |
| MJ01 | Complete final independent acceptance | XQ01 | YS01,YS02 | | SHIP |

<!-- sdd-contract:start -->
```json
{
  "protocol": "sdd-loop-delivery/v1",
  "revision": "SDD-v1",
  "objective": "Add one dependency and prove the built artifact still validates",
  "implementation_logic": {
    "protocol": "implementation-logic/v1",
    "paths": [
      {
        "id": "LJ01",
        "requirement_ids": [
          "XQ01"
        ],
        "acceptance_ids": [
          "YS01",
          "YS02"
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
          "XQ01"
        ],
        "acceptance_ids": [
          "YS01",
          "YS02"
        ],
        "modification_packages": [
          "@demo/core"
        ],
        "depends_on": [],
        "estimated_minutes": 40,
        "test_budget": {
          "minutes": 13,
          "max_new_test_files": 0,
          "acceptance_basis": {
            "reason": "a cold install and a packed smoke run dominate the measured time",
            "acceptance_ids": [
              "YS01",
              "YS02"
            ]
          }
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
    "mode": "fresh",
    "basis": [
      "Current repository source and direct consumer evidence"
    ],
    "predecessors": []
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
      "title": "The added dependency builds and loads",
      "kind": "must-ship",
      "status": "pending",
      "dependencies": [],
      "acceptance": [
        "YS01",
        "YS02"
      ]
    }
  ],
  "acceptance": [
    {
      "id": "YS01",
      "requirement_ids": [
        "XQ01"
      ],
      "oracle": "the build emits the bundle without a resolver warning",
      "claim": {
        "id": "DL01",
        "statement": "The added dependency resolves and the bundle builds",
        "dimension": "BUILD_OUTPUT",
        "quantifier": "SINGLE"
      },
      "method": "pnpm --filter @demo/core run build",
      "environment": "supported runtime",
      "packages": [
        "@demo/core"
      ],
      "execution": {
        "isolation": "INDEPENDENT",
        "timeout_seconds": 1200,
        "timeout_reason": "a cold install plus a full bundle exceeds the default ceiling on a first run; the case is already one claim and cannot be split further",
        "readiness_oracle": "the build command reports its exit status",
        "state_boundary": "Fresh install directory owned by this case",
        "evidence_boundary": "YS01 keeps the build log tail",
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
        "XQ01"
      ],
      "oracle": "the packed consumer imports the built bundle and returns the expected result",
      "claim": {
        "id": "DL02",
        "statement": "A packed consumer loads the built bundle",
        "dimension": "BEHAVIOR",
        "quantifier": "SINGLE"
      },
      "method": "pnpm --filter @demo/core run smoke:packed",
      "environment": "supported runtime",
      "packages": [
        "@demo/core"
      ],
      "execution": {
        "isolation": "SHARED_SAFE",
        "timeout_seconds": 300,
        "failure_containment": "The shared install directory is recreated from the frozen lockfile before this case runs, so a failed build cannot leave a partial tree that this case reads as success",
        "readiness_oracle": "the smoke command reports its exit status",
        "state_boundary": "The install directory YS01 owns, reset by its owner before use",
        "evidence_boundary": "YS02 keeps its own smoke output",
        "blocking_acceptance_ids": [
          "YS01"
        ],
        "consumes": [
          {
            "artifact": "packages/demo/dist/index.js",
            "produced_by": "YS01",
            "candidate_binding": "the current candidate commit under verification"
          }
        ]
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
  "shared_mechanism_writes": [
    {
      "mechanism": "lockfile",
      "target": "pnpm-lock.yaml",
      "managers": [
        "pnpm-workspace.yaml"
      ],
      "write_points": [
        "packages/demo/package.json"
      ],
      "owners": [
        "@demo/core"
      ]
    }
  ]
}
```
<!-- sdd-contract:end -->

````

Reading it back:

- **`shared_mechanism_writes` names the serialization point, not the edit.** `target` is the file every batch would contend on, `write_points` are the manifests whose edit reaches it, `managers` are the workspace files that decide how it resolves, and `owners` must be inside the modification authority the contract already grants. `repo-facts.ts check` compares this against the repository's real lockfile-to-package mapping.
- **`SHARED_SAFE` is a claim about containment, so it must state it.** `failure_containment` says what resets the shared state and why one case's failure cannot be read as another's success. Without that, two cases sharing a directory are not `SHARED_SAFE`; they are one case that should be split or serialized.
- **A case that reads another's output declares `consumes`.** `produced_by` names the acceptance that builds it — which must also appear in `blocking_acceptance_ids`, because a consumer that cannot run when its producer fails is exactly a blocking edge. `candidate_binding` ties the artifact to the candidate under verification, so a stale build from an earlier attempt cannot satisfy it. An artifact from outside the delivery sets `produced_by: "external"` and names its `source` instead.
- **`timeout_reason` is required only above the controller's ceiling**, and it must explain why the case cannot be narrowed rather than why the machine is slow. A long journey that could be split is not a reason.
- **`test_budget.acceptance_basis`** appears for the same kind of reason: a budget above the default share cites the acceptance cases that consume it, so the number is traceable to measured work instead of a preference.

<!-- reading-receipt: a3cee2e8 -->
