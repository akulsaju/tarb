import assert from 'node:assert/strict'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { Readable } from 'node:stream'
import test from 'node:test'
import { createStatusMediaHandler, MAX_MEDIA_BYTES, mediaKey } from './status-media.mjs'
import { createMessagingHandler } from './messages.mjs'

const hash = (value) => createHash('sha256').update(value).digest('hex')
const jpeg = Buffer.from([255, 216, ...Buffer.from('test-image-payload'), 255, 217])
const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypisom'), Buffer.alloc(20)])
function harness() {
  const data = new Map(), files = new Map()
  let version = 0
  const store = {
    async read(key) { return data.has(key) ? structuredClone(data.get(key)) : null },
    async write(key, value, etag) {
      if ((!etag && data.has(key)) || (etag && data.get(key)?.etag !== etag)) throw new Error('conflict')
      data.set(key, { value: structuredClone(value), etag: String(++version) })
    },
    async remove(key) { data.delete(key); files.delete(key) },
    async writeMedia(key, bytes) { if (files.has(key)) throw new Error('conflict'); files.set(key, bytes) },
    async readMedia(key) { return files.get(key) || null },
    isConflict(error) { return error.message === 'conflict' },
  }
  const users = ['Alice', 'Bob', 'Carol'].map((name) => {
    const user = { id: randomUUID(), name, username: name.toLowerCase(), token: randomBytes(32).toString('hex') }
    data.set(`accounts/${user.id}.json`, { value: user, etag: String(++version) })
    data.set(`sessions/${hash(user.token)}.json`, { value: { userId: user.id, accountKey: `accounts/${user.id}.json`, expiresAt: Date.now() + 3 * 86400000 }, etag: String(++version) })
    return user
  })
  const [alice, bob, carol] = users
  const chatId = hash([alice.id, bob.id].sort().join(':'))
  data.set(`conversations/${chatId}.json`, { value: { id: chatId, members: [alice, bob], messages: [], read: {} }, etag: String(++version) })
  for (const user of [alice, bob]) data.set(`inboxes/${user.id}.json`, { value: [chatId], etag: String(++version) })
  async function invoke(handler, req) {
    const response = {
      headers: {}, statusCode: 0,
      setHeader(key, value) { this.headers[key] = value },
      status(code) { this.statusCode = code; return this },
      json(body) { this.body = body; return this },
      end(body) { this.body = body; return this },
    }
    await handler(req, response)
    return response
  }
  const headers = (user) => ({ host: 'vybe.test', origin: 'https://vybe.test', cookie: `__Host-vybe-session=${user.token}` })
  const mediaHandler = createStatusMediaHandler(store), messages = createMessagingHandler(store)
  async function media(method, id, user = alice, bytes = jpeg, type = 'image/jpeg', extra = {}) {
    const req = Readable.from([bytes])
    Object.assign(req, { method, url: `/api/status-media?id=${id}`, headers: { ...headers(user), 'content-type': type, ...extra } })
    return invoke(mediaHandler, req)
  }
  const post = (body, user = alice) => invoke(messages, { method: 'POST', headers: { ...headers(user), 'content-type': 'application/json' }, body })
  async function publish(id, user = alice) {
    return post({ action: 'status-post', postId: id, mediaId: id, text: '', color: 'violet' }, user)
  }
  return { data, files, users, alice, bob, carol, media, post, publish }
}

test('private photo upload publishes without text and only owner and contacts can retrieve it', async () => {
  const h = harness(), id = randomUUID()
  const upload = await h.media('POST', id)
  assert.equal(upload.statusCode, 200)
  assert.deepEqual(upload.body.media, { id, kind: 'photo' })
  assert.equal((await h.media('GET', id)).statusCode, 404, 'unpublished media cannot be read')
  const result = await h.publish(id)
  assert.equal(result.statusCode, 200)
  assert.deepEqual(result.body.statuses[0].media, { id, kind: 'photo' })
  const contact = await h.media('GET', id, h.bob)
  assert.equal(contact.statusCode, 200)
  assert.deepEqual(contact.body, jpeg)
  assert.equal(contact.headers['Content-Type'], 'image/jpeg')
  assert.equal(contact.headers['Cache-Control'], 'private, no-store')
  assert.equal(contact.headers['Cross-Origin-Resource-Policy'], 'same-origin')
  assert.equal((await h.media('GET', id, h.carol)).statusCode, 404)
  assert.equal((await h.media('GET', id, h.bob, jpeg, 'image/jpeg', { cookie: '' })).statusCode, 401)
  assert.equal((await h.publish(id, h.bob)).statusCode, 400, 'cannot use another account upload')
})

test('video supports bounded and suffix byte ranges and HEAD for playback', async () => {
  const h = harness(), id = randomUUID()
  assert.equal((await h.media('POST', id, h.alice, mp4, 'video/mp4')).body.media.kind, 'video')
  await h.publish(id)
  const range = await h.media('GET', id, h.bob, jpeg, '', { range: 'bytes=4-11' })
  assert.equal(range.statusCode, 206)
  assert.deepEqual(range.body, mp4.subarray(4, 12))
  assert.equal(range.headers['Content-Range'], `bytes 4-11/${mp4.length}`)
  const suffix = await h.media('GET', id, h.bob, jpeg, '', { range: 'bytes=-5' })
  assert.deepEqual(suffix.body, mp4.subarray(-5))
  assert.equal((await h.media('GET', id, h.bob, jpeg, '', { range: 'bytes=9999-' })).statusCode, 416)
  assert.equal((await h.media('GET', id, h.bob, jpeg, '', { range: 'bytes=0-1,4-5' })).statusCode, 416)
  const head = await h.media('HEAD', id, h.bob)
  assert.equal(head.statusCode, 200)
  assert.equal(head.body, undefined)
  assert.equal(head.headers['Content-Length'], mp4.length)
})

test('expiry and owner deletion revoke access and delete stored bytes', async (t) => {
  const h = harness(), id = randomUUID()
  await h.media('POST', id)
  await h.publish(id)
  await h.post({ action: 'status-delete', postId: id }, h.bob)
  assert.equal((await h.media('GET', id, h.bob)).statusCode, 200)
  await h.post({ action: 'status-delete', postId: id })
  assert.equal((await h.media('GET', id, h.bob)).statusCode, 404)
  assert.equal(h.files.size, 0)
  assert.equal(h.data.has(mediaKey(id)), false)
  const next = randomUUID()
  await h.media('POST', next); await h.publish(next)
  const expiry = h.data.get(`statuses/${h.alice.id}.json`).value[0].expiresAt
  t.mock.method(Date, 'now', () => expiry + 1)
  assert.equal((await h.media('GET', next, h.bob)).statusCode, 404)
})

test('upload validates authenticated origin, type, real byte limit and file signature', async () => {
  const h = harness()
  assert.equal((await h.media('POST', randomUUID(), h.alice, jpeg, 'image/jpeg', { origin: 'https://attacker.test' })).statusCode, 403)
  assert.equal((await h.media('POST', randomUUID(), h.alice, jpeg, 'image/svg+xml')).statusCode, 415)
  assert.equal((await h.media('POST', randomUUID(), h.alice, jpeg, 'video/mp4')).statusCode, 400)
  assert.equal((await h.media('POST', randomUUID(), h.alice, Buffer.alloc(MAX_MEDIA_BYTES + 1))).statusCode, 413)
  assert.equal((await h.media('POST', randomUUID(), h.alice, jpeg, 'image/jpeg', { 'content-length': MAX_MEDIA_BYTES + 1 })).statusCode, 413)
  assert.equal((await h.media('POST', 'bad-id')).statusCode, 400)
  const id = randomUUID()
  await h.media('POST', id)
  assert.equal((await h.media('POST', id)).statusCode, 200, 'upload retry is idempotent')
  assert.equal((await h.media('POST', id, h.bob)).statusCode, 409)
  assert.equal((await h.post({ action: 'status-post', postId: randomUUID(), mediaId: id, text: '', color: 'violet' })).statusCode, 400)
})

test('upload rate is bounded independently of message mutation quota', async () => {
  const h = harness()
  h.data.set(`media-limits/${h.alice.id}-${Math.floor(Date.now() / 3600000)}.json`, { value: { attempts: 20 }, etag: 'limited' })
  assert.equal((await h.media('POST', randomUUID())).statusCode, 429)
})
