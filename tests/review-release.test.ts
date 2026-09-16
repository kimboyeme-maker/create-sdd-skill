import { expect, test } from 'bun:test'
import { planChecks } from '../scripts/review-release'

test('a check that needs the sibling skill is disclosed as skipped, never counted as a pass', () => {
  const installed = planChecks(true)
  expect(installed.every((plan) => plan.skipped === undefined)).toBe(true)
  const names = installed.map((plan) => plan.check)
  expect(names).toContain('control-plane')
  expect(names).toContain('examples')

  const absent = planChecks(false)
  // The same checks are still planned, so the report names what it could not run.
  expect(absent.map((plan) => plan.check)).toEqual(names)
  const skipped = absent.filter((plan) => plan.skipped !== undefined).map((plan) => plan.check)
  expect(skipped).toEqual(['control-plane', 'examples', 'behavior-cases'])
  // Checks this skill owns outright never depend on the sibling being installed.
  expect(absent.find((plan) => plan.check === 'tests')?.skipped).toBeUndefined()
  expect(absent.find((plan) => plan.check === 'receipts')?.skipped).toBeUndefined()
})
