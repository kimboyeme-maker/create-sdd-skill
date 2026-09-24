import { expect, test } from 'bun:test'
import { run } from '../src/api'
test('keeps legacy order', () => expect(run()).toBe('ok'))
test('A1 old run', () => expect(run()).toBe('ok'))
