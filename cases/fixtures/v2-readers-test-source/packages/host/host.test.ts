import { install } from './index'

test('reports a downstream failure', () => {
  const failure = new Error('downstream failed')
  expect(() => install(Promise.reject(failure))).toThrow()
})
