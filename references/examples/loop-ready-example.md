# Loop-ready example

A fixture-shaped illustration of every required section and contract field; it is not evidence for any real repository.

## Worked loop-ready SDD

````markdown
# Input validation design

## Breaking Changes

**Applicability:** NOT_APPLICABLE

**Reason:** The entry signature and successful result remain unchanged; missing input already returns Invalid.

**Evidence:** The isolated example entry below and its before/after acceptance specify the same public contract.

## New/Changed API & Typing

**Applicability:** APPLICABLE

**Signatures:** ```ts
type Request = { value?: number };
type Result = { ok: true; value: number } | { ok: false; error: "Invalid" };
function handle(request: Request): Result;
```

**Inputs and outputs:** A Request enters handle. Missing value returns Invalid; a present number produces the same value.

**Errors:** Invalid is returned as a Result; it is not thrown.

**Examples:** ```ts
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

**Pseudocode:** ```text
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

**Pseudocode:** ```text
result = validated; return result
```

**State changes:** Publish the validated value once

**Failure:** A local assignment has no fallible external operation

**Lifecycle and recovery:** Synchronous call-local flow; no await, cancellation or acquired resource. Rejection preserves the previous slot.

**Observable result:** Valid input returns and publishes the supplied value; YS01 observes both paths

# Example SDD

## 交付事项

| ID | description | requirement_ids | acceptance_ids | batch_ids | gate |
| --- | --- | --- | --- | --- | --- |
| PC01 | 完成输入检查并保持原有行为 | XQ01 | YS01 | | |
| BH01 | 关闭输入缺失时的错误分支 | XQ01 | YS01 | PC01 | |
| MJ01 | 完成最终独立验收 | XQ01 | YS01 | PC01 | SHIP |

<!-- sdd-contract:start -->
```json
{
  "protocol": "sdd-loop-delivery/v1",
  "revision": "SDD-v1",
  "objective": "Land one observable feature",
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
          "YS01"
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
          "YS01"
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
      "title": "Main path",
      "kind": "must-ship",
      "status": "pending",
      "dependencies": [],
      "acceptance": [
        "YS01"
      ]
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
  }
}
```
<!-- sdd-contract:end -->
````

The outer example uses a Markdown fence only for documentation. In the actual SDD, write the marker, JSON fence, and closing marker literally.

## Guarded acceptance: the `REQUIRED` branch

`YS01` above is a positive business path, so its `oracle_sensitivity` is `NOT_APPLICABLE` with a reason. A case that observes a guard takes the other branch instead; these are its exact fields:

```json
"oracle_sensitivity": {
  "applicability": "REQUIRED",
  "fault_model": "The pre-validation loop is removed, so a replay containing one read-only source writes the earlier writable sources before rejecting",
  "perturbation_method": "Delete the validation loop that precedes the apply loop in BZ04 and rerun the case",
  "restoration_method": "Reinstate the validation loop ahead of the first apply call and rerun the case",
  "expected_flip": "PASS_TO_FAIL_TO_PASS",
  "implementation_timing": "IMPLEMENTATION_REQUIRED"
}
```

`applicability` is `REQUIRED` or `NOT_APPLICABLE`; no other value is accepted. `NOT_APPLICABLE` carries `reason` and nothing else. `REQUIRED` carries all five fields above, `expected_flip` is always the literal `PASS_TO_FAIL_TO_PASS`, and `implementation_timing` is `IMPLEMENTATION_REQUIRED` for a guard this delivery still has to build or `DESIGN_PROVEN` for one already probed in an isolated copy — `DESIGN_PROVEN` additionally requires a non-empty `evidence` array naming where that probe is recorded.

<!-- reading-receipt: 1d81aa9a -->
