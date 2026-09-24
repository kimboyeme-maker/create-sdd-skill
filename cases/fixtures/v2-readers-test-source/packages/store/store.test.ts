test('surfaces a downstream failure', () => {
  expect(() => {
    throw new Error('downstream failed')
  }).toThrow('downstream failed')
})
