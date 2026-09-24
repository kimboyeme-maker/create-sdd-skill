import { install } from '../host/index'

test('rejects thenables', () => {
  expect(() => install(Promise.resolve())).toThrow('install result must not be thenable')
})
