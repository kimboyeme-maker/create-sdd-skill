# Assess feature A

## Intake
Users ask for a greeting endpoint; the request came from support tickets.

## Research
The package `packages/feature-a` has no public entry point today.

## Options
- O1 Add `featureA()` to the existing package.
- O2 Create a new service for greetings.

## Decision
Go with O1: smallest change that serves the request.

## Proposed entries
- E1 A caller can obtain the feature-a greeting.

<!-- sdd-contract:start -->
```json
{
  "protocol": "sdd-assessment/v1",
  "id": "idea-a",
  "revision": "1",
  "options": [
    {
      "id": "O1"
    },
    {
      "id": "O2"
    }
  ],
  "decision": {
    "outcome": "go",
    "option": "O1"
  },
  "proposed_entries": [],
  "unresolved_user_decisions": []
}
```
<!-- sdd-contract:end -->
