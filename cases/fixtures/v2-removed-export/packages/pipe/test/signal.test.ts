import * as root from '../src/index'

test('the root exports the sync runner', () => {
  expect(typeof root.runSync).toBe('function')
})
