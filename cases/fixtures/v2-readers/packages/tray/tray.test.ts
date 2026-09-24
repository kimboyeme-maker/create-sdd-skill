import { Host } from '../host/index'

test('spies on run', () => {
  vi.spyOn(Host.prototype, 'run')
})
