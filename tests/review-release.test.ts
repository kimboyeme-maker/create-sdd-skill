import { expect, test } from 'bun:test'
import { planChecks } from '../scripts/review-release'

test('a check that needs the sibling skill is disclosed as skipped, never counted as a pass', () => {
  const installed = planChecks(true)
  expect(installed.every((plan) => plan.skipped === undefined)).toBe(true)
  const names = installed.map((plan) => plan.check)
  expect(names).toContain('control-plane')
  expect(names).toContain('examples')
  expect(names).toContain('defect-cases')

  const absent = planChecks(false)
  // The same checks are still planned, so the report names what it could not run.
  expect(absent.map((plan) => plan.check)).toEqual(names)
  const skipped = absent.filter((plan) => plan.skipped !== undefined).map((plan) => plan.check)
  // Only the control-plane probe genuinely reaches into the sibling skill. The other two check
  // files this skill owns, and marking them as needing a neighbour reported a packaging fact as a
  // coverage gap.
  expect(skipped).toEqual(['control-plane'])
  // Checks this skill owns outright never depend on the sibling being installed.
  expect(absent.find((plan) => plan.check === 'tests')?.skipped).toBeUndefined()
  expect(absent.find((plan) => plan.check === 'receipts')?.skipped).toBeUndefined()
})
