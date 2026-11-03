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
