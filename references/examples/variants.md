# Worked variants

Two contract shapes the [worked SDD](loop-ready-example.md) does not exercise. Each states only what it changes about that document — its delivery index and an overlay onto its contract block — because its design body is identical, word for word, to the base. `check-examples.ts` composes each variant with the base and validates the whole result, so a variant is checked exactly as strictly as a standalone copy was.

The overlay is JSON Merge Patch with one addition. An object merges key by key and `null` deletes a key. An array is replaced wholesale, unless the overlay is `{"merge_by_id": [...]}`, which edits the members whose `id` matches, appends the ones that do not, and drops the ids listed under `"remove"`. Replacement is the default because an array without ids has no member identity to merge on.

The [continuation example](continuation-example.md) stays a document of its own: it teaches `lineage`, `deferred` and `environment_exceptions` through a different scenario, and its design body genuinely differs rather than being a copy.

The values are fixtures. None of them is evidence for any real repository.

## Decision: an authority choice and a universal absence claim

A complete, minimal SDD for work whose route waits on a choice only the user may make, and whose acceptance is a universal absence claim. It exists because three contract shapes had no worked instance: a `requirement_type: "decision"` requirement with its `decision` metadata, a `claim.quantifier: "UNIVERSAL"` with its `universe`, and `inventory_authorities.RUNTIME_RESOLUTION` in its `REQUIRED` form.

**Delivery index:**

````markdown
# Decision example SDD

## 交付事项

| ID | description | requirement_ids | acceptance_ids | batch_ids | gate |
| --- | --- | --- | --- | --- | --- |
| PC01 | Close the rejection decision and remove the legacy validator | JC01,XQ01 | YS01 | | |
| BH01 | Close the legacy-absence scan over its declared universe | XQ01 | YS01 | PC01 | |
| MJ01 | Complete final independent acceptance | JC01,XQ01 | YS01 | | SHIP |
````

**Contract overlay:**

```json
{
  "objective": "Remove the legacy validator after a user decides which rejection the product keeps",
  "implementation_logic": {
    "paths": {
      "merge_by_id": [
        {
          "id": "LJ01",
          "requirement_ids": [
            "JC01",
            "XQ01"
          ]
        }
      ]
    }
  },
  "delivery_plan": {
    "batches": {
      "merge_by_id": [
        {
          "id": "PC01",
          "requirement_ids": [
            "JC01",
            "XQ01"
          ]
        }
      ]
    }
  },
  "inventory_authorities": {
    "RUNTIME_RESOLUTION": {
      "applicability": "REQUIRED",
      "reason": "The absence claim quantifies over the installed graph, so the resolver output is part of the universe it inspects",
      "source_fingerprint": "sha256 of packages/demo/src at the admitted commit",
      "lockfile_fingerprint": "sha256 of the root lockfile",
      "tool_runtime_version": "node 24.16.0",
      "workspace_link_fingerprint": "sha256 of the resolved workspace link graph",
      "resolver_mode": "frozen-lockfile"
    }
  },
  "requirements": {
    "merge_by_id": [
      {
        "id": "JC01",
        "title": "Which rejection the product keeps",
        "kind": "must-ship",
        "status": "pending",
        "requirement_type": "decision",
        "dependencies": [],
        "acceptance": [
          "YS01"
        ],
        "decision": {
          "authority": "user",
          "question": "Does a negative value return Invalid, or throw a RangeError the caller must handle?",
          "status": "resolved",
          "resolution": "Return Invalid; the caller never branches on a thrown type",
          "evidence": "user reply choosing the returned variant"
        }
      },
      {
        "id": "XQ01",
        "title": "No legacy validator remains",
        "requirement_type": "delivery",
        "dependencies": [
          "JC01"
        ]
      }
    ]
  },
  "acceptance": {
    "merge_by_id": [
      {
        "id": "YS01",
        "requirement_ids": [
          "JC01",
          "XQ01"
        ],
        "oracle": "no module under the declared universe imports or defines the legacy validator",
        "claim": {
          "statement": "The legacy validator is absent from every declared surface",
          "dimension": "ARCHITECTURE",
          "quantifier": "UNIVERSAL",
          "universe": [
            "packages/demo/src",
            "packages/demo/package.json",
            "the root lockfile",
            "the emitted dist output"
          ]
        },
        "method": "pnpm --filter @demo/core run check:legacy-absent",
        "oracle_sensitivity": {
          "applicability": "REQUIRED",
          "fault_model": "One module keeps importing the legacy validator, so the absence claim is false while the scan still reports clean",
          "perturbation_method": "Reintroduce the import in one module under the declared universe and rerun the case",
          "restoration_method": "Remove that import and rerun the case",
          "expected_flip": "PASS_TO_FAIL_TO_PASS",
          "implementation_timing": "IMPLEMENTATION_REQUIRED",
          "reason": null
        }
      }
    ]
  }
}
```

## Shared mechanism: one write point two batches reach

A complete, minimal SDD for work that edits a dependency manifest and whose two acceptance cases share one install directory. It exists because four contract shapes had no worked instance: `shared_mechanism_writes`, `execution.isolation: "SHARED_SAFE"` with `failure_containment`, `execution.consumes`, and `execution.timeout_reason`.

**Delivery index:**

````markdown
# Shared mechanism example SDD

## 交付事项

| ID | description | requirement_ids | acceptance_ids | batch_ids | gate |
| --- | --- | --- | --- | --- | --- |
| PC01 | Add the dependency and prove the built bundle loads | XQ01 | YS01,YS02 | | |
| BH01 | Close the packed-consumer load path | XQ01 | YS02 | PC01 | |
| MJ01 | Complete final independent acceptance | XQ01 | YS01,YS02 | | SHIP |
````

**Contract overlay:**

```json
{
  "objective": "Add one dependency and prove the built artifact still validates",
  "implementation_logic": {
    "paths": {
      "merge_by_id": [
        {
          "id": "LJ01",
          "acceptance_ids": [
            "YS01",
            "YS02"
          ]
        }
      ]
    }
  },
  "delivery_plan": {
    "batches": {
      "merge_by_id": [
        {
          "id": "PC01",
          "acceptance_ids": [
            "YS01",
            "YS02"
          ],
          "estimated_minutes": 40,
          "test_budget": {
            "minutes": 13,
            "acceptance_basis": {
              "reason": "a cold install and a packed smoke run dominate the measured time",
              "acceptance_ids": [
                "YS01",
                "YS02"
              ]
            }
          }
        }
      ]
    },
    "final_verification_shards": {
      "merge_by_id": [
        {
          "id": "FV01",
          "acceptance_ids": [
            "YS01",
            "YS02"
          ]
        }
      ]
    }
  },
  "requirements": {
    "merge_by_id": [
      {
        "id": "XQ01",
        "title": "The added dependency builds and loads",
        "acceptance": [
          "YS01",
          "YS02"
        ]
      }
    ]
  },
  "acceptance": {
    "merge_by_id": [
      {
        "id": "YS01",
        "oracle": "the build emits the bundle without a resolver warning",
        "claim": {
          "statement": "The added dependency resolves and the bundle builds",
          "dimension": "BUILD_OUTPUT"
        },
        "method": "pnpm --filter @demo/core run build",
        "execution": {
          "timeout_seconds": 1200,
          "timeout_reason": "a cold install plus a full bundle exceeds the default ceiling on a first run; the case is already one claim and cannot be split further",
          "readiness_oracle": "the build command reports its exit status",
          "state_boundary": "Fresh install directory owned by this case",
          "evidence_boundary": "YS01 keeps the build log tail"
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
    ]
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

<!-- reading-receipt: de4533fd -->
