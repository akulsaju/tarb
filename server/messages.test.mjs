import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import test from 'node:test'
import { createAuthHandler } from './auth.mjs'
import { createMessagingHandler } from './messages.mjs'

const digest = (value) => createHash('sha256').update(value).digest('hex')
async function harness() {
  const data = new Map()
  let revision = 0
  const store = {
    async read(key) { return data.has(key) ? structuredClone(data.get(key)) : null },
    async write(key, value, etag) {
      if ((!etag && data.has(key)) || (etag && data.get(key)?.etag !== etag)) throw new Error('conflict')
      data.set(key, { value: structuredClone(value), etag: String(++revision) })
    },
    async remove(key) { data.delete(key) },
    isConflict(error) { return error.message === 'conflict' },
  }
  const auth = createAuthHandler(store), messages = createMessagingHandler(store)
  async function request(handler, body, cookie, headers = {}, method = 'POST') {
    const response = {
      headers: {}, statusCode: 0,
      setHeader(key, value) { this.headers[key] = value },
      status(code) { this.statusCode = code; return this },
      json(value) { this.body = value; return this },
    }
    await handler({ method, headers: { host: 'vybe.test', origin: 'https://vybe.test', 'content-type': 'application/json', cookie, ...headers }, body }, response)
    return response
  }
  const users = []
  for (const name of ['Alice', 'Bob', 'Carol']) {
    const email = `${name.toLowerCase()}@example.test`
    const result = await request(auth, { action: 'signup', name, username: name.toLowerCase(), email, password: 'testing-password-only' })
    assert.equal(result.statusCode, 200)
    users.push({ ...result.body.user, cookie: result.headers['Set-Cookie'].split(';')[0] })
  }
  const [alice, bob, carol] = users
  const post = (body, user = alice, headers, method) => request(messages, body, user?.cookie, headers, method)
  const start = () => post({ action: 'start', email: bob.email })
  const send = (chatId, text, user = alice, extra = {}) => post({ action: 'send', chatId, text, messageId: randomUUID(), ...extra }, user)
  return { data, auth, request, post, start, send, alice, bob, carol }
}

test('new accounts start empty and both participants can reload server-stored conversations', async () => {
  const h = await harness()
  assert.deepEqual((await h.post({ action: 'sync' })).body.chats, [])
  const opened = await h.start()
  assert.equal(opened.statusCode, 200)
  const id = opened.body.chat.id
  const result = await h.send(id, 'A real message')
  assert.equal(result.statusCode, 200)
  const received = await h.post({ action: 'sync' }, h.bob)
  assert.equal(received.body.chats[0].messages[0].text, 'A real message')
  assert.equal(received.body.chats[0].messages[0].senderId, h.alice.id)
  assert.equal(JSON.stringify(received.body).includes('hash'), false)
  assert.equal(JSON.stringify(received.body).includes('email'), false)
  assert.equal(received.headers['Cache-Control'], 'no-store')
  const login = await h.request(h.auth, { action: 'login', email: h.alice.email, password: 'testing-password-only' })
  const freshSession = { cookie: login.headers['Set-Cookie'].split(';')[0] }
  assert.equal((await h.post({ action: 'sync' }, freshSession)).body.chats[0].messages[0].text, 'A real message')
  assert.equal((await h.post({ action: 'sync' }, h.carol)).body.chats.length, 0)
})

test('authenticated session, origin, content type, size and method are enforced', async () => {
  const h = await harness()
  assert.equal((await h.post({ action: 'sync' }, { cookie: '' })).statusCode, 401)
  assert.equal((await h.post({ action: 'sync' }, h.alice, { origin: 'https://attacker.test' })).statusCode, 403)
  assert.equal((await h.post({ action: 'sync' }, h.alice, { 'content-type': 'text/plain' })).statusCode, 415)
  assert.equal((await h.post({ action: 'sync' }, h.alice, { 'content-length': '20000' })).statusCode, 413)
  assert.equal((await h.post({ action: 'sync' }, h.alice, {}, 'GET')).statusCode, 405)
  assert.equal((await h.post('{bad json')).statusCode, 400)
  await h.request(h.auth, { action: 'logout' }, h.alice.cookie)
  assert.equal((await h.post({ action: 'sync' })).statusCode, 401)
})

test('expired sessions cannot access messages', async () => {
  const h = await harness()
  const key = `sessions/${digest(h.alice.cookie.split('=')[1])}.json`
  h.data.get(key).value.expiresAt = Date.now() - 1
  assert.equal((await h.post({ action: 'sync' })).statusCode, 401)
})

test('non-members cannot send, read, react or see another conversation', async () => {
  const h = await harness()
  const { id } = (await h.start()).body.chat
  for (const action of ['send', 'read', 'react']) {
    const result = await h.post({ action, chatId: id, text: 'forged', messageId: randomUUID(), reaction: '💛' }, h.carol)
    assert.equal(result.statusCode, 404)
  }
  assert.equal((await h.post({ action: 'sync' }, h.carol)).body.chats.length, 0)
})

test('conversation creation is deterministic and unknown or self contacts are rejected', async () => {
  const h = await harness()
  const first = await h.start()
  const second = await h.post({ action: 'start', email: h.alice.email }, h.bob)
  assert.equal(first.body.chat.id, second.body.chat.id)
  assert.equal((await h.post({ action: 'sync' })).body.chats.length, 1)
  assert.equal((await h.post({ action: 'start', email: h.alice.email })).statusCode, 400)
  assert.equal((await h.post({ action: 'start', email: 'missing@example.test' })).statusCode, 404)
  assert.equal((await h.post({ action: 'start', email: 'invalid' })).statusCode, 400)
})

test('concurrent sends retain both messages and idempotent retry cannot duplicate a message', async () => {
  const h = await harness()
  const { id } = (await h.start()).body.chat
  const [one, two] = await Promise.all([h.send(id, 'one'), h.send(id, 'two', h.bob)])
  assert.equal(one.statusCode, 200); assert.equal(two.statusCode, 200)
  const chat = (await h.post({ action: 'sync' })).body.chats[0]
  assert.deepEqual(chat.messages.map((message) => message.text).sort(), ['one', 'two'])
  const mine = chat.messages.find((message) => message.senderId === h.alice.id)
  assert.equal((await h.send(id, mine.text, h.alice, { messageId: mine.id })).body.chat.messages.length, 2)
  assert.equal((await h.send(id, 'changed', h.alice, { messageId: mine.id })).statusCode, 409)
  assert.equal((await h.send(id, mine.text, h.bob, { messageId: mine.id })).statusCode, 409)
})

test('replies, reactions and monotonic read positions persist on both accounts', async () => {
  const h = await harness()
  const { id } = (await h.start()).body.chat
  const first = (await h.send(id, 'hello')).body.chat.messages[0]
  const reply = await h.send(id, 'reply', h.bob, { replyId: first.id })
  assert.equal(reply.body.chat.messages[1].replyId, first.id)
  const reacted = await h.post({ action: 'react', chatId: id, messageId: first.id, reaction: '💛' }, h.bob)
  assert.equal(reacted.body.chat.messages[0].reactions[h.bob.id], '💛')
  const last = reply.body.chat.messages[1]
  await h.post({ action: 'read', chatId: id, messageId: last.id })
  const older = await h.post({ action: 'read', chatId: id, messageId: first.id })
  assert.equal(older.body.chat.read[h.alice.id], 2)
  const removed = await h.post({ action: 'react', chatId: id, messageId: first.id, reaction: '' }, h.bob)
  assert.equal(removed.body.chat.messages[0].reactions[h.bob.id], '')
  assert.equal((await h.send(id, 'bad reply', h.alice, { replyId: randomUUID() })).statusCode, 400)
  assert.equal((await h.post({ action: 'read', chatId: id, messageId: randomUUID() })).statusCode, 404)
})

test('message bounds and per-account rate limits reject invalid writes explicitly', async () => {
  const h = await harness()
  const { id } = (await h.start()).body.chat
  assert.equal((await h.send(id, '   ')).statusCode, 400)
  assert.equal((await h.send(id, 'x'.repeat(4001))).statusCode, 400)
  assert.equal((await h.send('bad-id', 'test')).statusCode, 400)
  const key = `message-limits/${h.alice.id}-${Math.floor(Date.now() / 60000)}.json`
  h.data.get(key).value.attempts = 60
  assert.equal((await h.send(id, 'limited')).statusCode, 429)
  assert.equal((await h.post({ action: 'sync' })).statusCode, 200)
})

test('profile edits persist, sync to contacts and do not expose credentials or affect login', async () => {
  const h = await harness()
  await h.start()
  const save = await h.post({ action: 'profile-save', name: 'Alice Updated', about: 'Busy today', photo: '', version: 0 })
  assert.equal(save.statusCode, 200)
  assert.equal(save.body.profile.version, 1)
  const sync = (await h.post({ action: 'sync' }, h.bob)).body
  assert.equal(sync.profiles.find((profile) => profile.id === h.alice.id).about, 'Busy today')
  assert.equal(sync.profiles.find((profile) => profile.id === h.alice.id).name, 'Alice Updated')
  assert.equal(JSON.stringify(sync.profiles).includes('email'), false)
  assert.equal(JSON.stringify(sync.profiles).includes('hash'), false)
  assert.equal((await h.post({ action: 'sync' }, h.carol)).body.profiles.some((profile) => profile.id === h.alice.id), false)
  const login = await h.request(h.auth, { action: 'login', email: h.alice.email, password: 'testing-password-only' })
  assert.equal(login.statusCode, 200)
  const restored = await h.post({ action: 'sync' }, { cookie: login.headers['Set-Cookie'].split(';')[0] })
  assert.equal(restored.body.profiles.find((profile) => profile.id === h.alice.id).name, 'Alice Updated')
})

test('profile saves validate inputs, reject stale writes and cannot change another account', async () => {
  const h = await harness()
  const profile = { action: 'profile-save', name: 'Updated', about: '', photo: '', version: 0 }
  assert.equal((await h.post({ ...profile, name: 'x' })).statusCode, 400)
  assert.equal((await h.post({ ...profile, about: 'x'.repeat(141) })).statusCode, 400)
  assert.equal((await h.post({ ...profile, photo: 'data:image/svg+xml;base64,abc' })).statusCode, 400)
  assert.equal((await h.post({ ...profile, photo: 'data:image/jpeg;base64,YmFk' })).statusCode, 400)
  assert.equal((await h.post({ ...profile, photo: 'x'.repeat(250001) })).statusCode, 400)
  assert.equal((await h.post(profile)).statusCode, 200)
  assert.equal((await h.post({ ...profile, name: 'Stale' })).statusCode, 409)
  const unrelated = await h.post({ ...profile, userId: h.alice.id, name: 'Carol Updated' }, h.carol)
  assert.equal(unrelated.body.profile.id, h.carol.id)
  assert.equal(h.data.get(`profiles/${h.alice.id}.json`).value.name, 'Updated')
})

test('photo can be saved and removed without changing other profile fields', async () => {
  const h = await harness()
  const photo = 'data:image/jpeg;base64,/9j/2Q=='
  const result = await h.post({ action: 'profile-save', name: 'Alice', about: 'Available', photo, version: 0 })
  assert.equal(result.statusCode, 200)
  assert.equal(result.body.profile.photo, photo)
  const removed = await h.post({ action: 'profile-save', name: 'Alice', about: 'Available', photo: '', version: 1 })
  assert.equal(removed.body.profile.photo, '')
  assert.equal(removed.body.profile.about, 'Available')
})

test('status posts are visible only to conversation contacts and their owner can delete them', async () => {
  const h = await harness()
  await h.start()
  const postId = randomUUID()
  const payload = { action: 'status-post', postId, text: 'Weekend plans', color: 'ocean' }
  const posted = await h.post(payload)
  assert.equal(posted.statusCode, 200)
  const post = posted.body.statuses[0]
  assert.equal(post.userId, h.alice.id)
  assert.equal(post.expiresAt - post.createdAt, 24 * 60 * 60 * 1000)
  assert.equal((await h.post({ action: 'sync' }, h.bob)).body.statuses[0].text, 'Weekend plans')
  assert.deepEqual((await h.post({ action: 'sync' }, h.carol)).body.statuses, [])
  assert.equal((await h.post(payload)).body.statuses.length, 1)
  assert.equal((await h.post({ ...payload, text: 'changed' })).statusCode, 409)
  await h.post({ action: 'status-delete', postId }, h.bob)
  assert.equal((await h.post({ action: 'sync' }, h.bob)).body.statuses.length, 1)
  await h.post({ action: 'status-delete', postId })
  assert.deepEqual((await h.post({ action: 'sync' }, h.bob)).body.statuses, [])
})

test('24-hour expiry is enforced by server time and expired posts do not count toward the cap', async (t) => {
  const h = await harness()
  await h.start()
  const now = Date.now()
  for (let index = 0; index < 10; index++) {
    assert.equal((await h.post({ action: 'status-post', postId: randomUUID(), text: `Post ${index}`, color: 'violet' })).statusCode, 200)
  }
  assert.equal((await h.post({ action: 'status-post', postId: randomUUID(), text: 'Over limit', color: 'rose' })).statusCode, 409)
  // Extend fixtures' session lifetimes to isolate status expiration from session expiry.
  for (const [key, record] of h.data) if (key.startsWith('sessions/')) record.value.expiresAt = now + 3 * 24 * 3600000
  t.mock.method(Date, 'now', () => now + 24 * 3600000 + 1000)
  assert.deepEqual((await h.post({ action: 'sync' }, h.bob)).body.statuses, [])
  const fresh = await h.post({ action: 'status-post', postId: randomUUID(), text: 'New day', color: 'rose' })
  assert.equal(fresh.statusCode, 200)
  assert.equal(fresh.body.statuses.length, 1)
})

test('status content is bounded and concurrent posts do not overwrite each other', async () => {
  const h = await harness()
  const payload = { action: 'status-post', postId: randomUUID(), text: 'Moment', color: 'violet' }
  assert.equal((await h.post({ ...payload, text: '' })).statusCode, 400)
  assert.equal((await h.post({ ...payload, text: 'x'.repeat(701) })).statusCode, 400)
  assert.equal((await h.post({ ...payload, color: 'invalid' })).statusCode, 400)
  assert.equal((await h.post({ action: 'status-delete', postId: 'bad' })).statusCode, 400)
  const results = await Promise.all([h.post(payload), h.post({ ...payload, postId: randomUUID(), text: 'Second' })])
  assert.ok(results.every((result) => result.statusCode === 200))
  assert.equal((await h.post({ action: 'sync' })).body.statuses.length, 2)
})
