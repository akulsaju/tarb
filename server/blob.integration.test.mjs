import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import { store } from './store.mjs'

test('large private Blob records retain strong ETags for conditional writes', {
  skip: !process.env.BLOB_READ_WRITE_TOKEN,
}, async () => {
  const path = `verification/${randomUUID()}.json`
  try {
    const text = 'A conversation must remain writable as it grows. '.repeat(400)
    await store.write(path, { text, count: 0 })
    const first = await store.read(path)
    assert.equal(first.etag.startsWith('W/'), false)
    await store.write(path, { text, count: 1 }, first.etag)
    const current = await store.read(path)
    assert.equal(current.value.count, 1)
    await assert.rejects(store.write(path, { text, count: 2 }, first.etag), (error) => store.isConflict(error))
    await store.write(path, { text, count: 2 }, current.etag)
    assert.equal((await store.read(path)).value.count, 2)
  } finally {
    await store.remove(path)
  }
})
