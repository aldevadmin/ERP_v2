import { describe, expect, it } from 'vitest'
import { jsonBody } from './http'

describe('jsonBody', () => {
  it('converts undefined values to explicit null instead of dropping the key', () => {
    // Plain JSON.stringify would produce '{"name":"Plate"}' here — the
    // "shape" key vanishes entirely, which is exactly the bug: a PATCH
    // body missing a key means "leave it unchanged" to the backend, not
    // "clear it", so a field an antd `allowClear` Select just cleared
    // (producing `undefined`) would silently fail to save.
    const result = jsonBody({ name: 'Plate', shape: undefined })

    expect(result).toBe('{"name":"Plate","shape":null}')
    expect(JSON.parse(result)).toEqual({ name: 'Plate', shape: null })
  })

  it('leaves an already-null value as null', () => {
    expect(jsonBody({ shape: null })).toBe('{"shape":null}')
  })

  it('leaves real values untouched', () => {
    expect(jsonBody({ shape: 9, name: 'Round' })).toBe('{"shape":9,"name":"Round"}')
  })

  it('matches plain JSON.stringify for a value with no undefined fields', () => {
    const values = { id: 1, name: 'Plate', is_active: true }
    expect(jsonBody(values)).toBe(JSON.stringify(values))
  })
})
