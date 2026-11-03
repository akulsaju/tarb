import assert from 'node:assert/strict'
import test from 'node:test'
import { createAuthHandler } from './auth.mjs'

function harness() {
  const data = new Map()
  let revision = 0
  const store = {
    async read(key) { return data.get(key) || null },
    async write(key, value, etag) {
      if ((!etag && data.has(key)) || (etag && data.get(key)?.etag !== etag)) throw new Error('conflict')
      data.set(key, { value, etag: String(++revision) })
    },
    async remove(key) { data.delete(key) },
    isConflict(error) { return error.message === 'conflict' },
  }
  const handler = createAuthHandler(store)
  async function request(body, options = {}) {
    const response = {
      headers: {}, statusCode: 0,
      setHeader(key, value) { this.headers[key] = value },
      status(code) { this.statusCode = code; return this },
      json(value) { this.body = value; return this },
    }
    await handler({
      method: 'POST',
      headers: { host: 'vybe.test', origin: 'https://vybe.test', 'content-type': 'application/json', ...options },
      body,
    }, response)
    return response
  }
  return { request, data }
}

const signup = {
  action: 'signup', name: 'Test Person', username: 'testperson',
  email: 'person@example.test', password: 'a-test-password-only',
}

test('signup stores salted hashes only, returns a public account and a secure session', async () => {
  const { request, data } = harness()
  const result = await request(signup)
  assert.equal(result.statusCode, 200)
  assert.equal(result.body.user.email, signup.email)
  assert.equal(result.body.user.hash, undefined)
  assert.match(result.headers['Set-Cookie'], /HttpOnly; Secure; SameSite=Strict/)
  assert.equal(result.headers['Cache-Control'], 'no-store')
  const account = [...data.values()].find((item) => item.value.email)?.value
  assert.ok(account.salt)
  assert.notEqual(account.hash, signup.password)
  assert.equal(JSON.stringify([...data.values()]).includes(signup.password), false)
})

test('login accepts server-stored accounts, rejects wrong passwords, and logout revokes the token', async () => {
  const { request, data } = harness()
  await request(signup)
  assert.equal((await request({ ...signup, action: 'login', password: 'wrong-password-123' })).statusCode, 401)
  const login = await request({ ...signup, action: 'login' })
  assert.equal(login.statusCode, 200)
  const before = [...data.keys()].filter((key) => key.startsWith('sessions/')).length
  const logout = await request({ action: 'logout' }, { cookie: login.headers['Set-Cookie'].split(';')[0] })
  assert.equal(logout.statusCode, 200)
  assert.match(logout.headers['Set-Cookie'], /Max-Age=0/)
  assert.equal([...data.keys()].filter((key) => key.startsWith('sessions/')).length, before - 1)
})

test('duplicate signup cannot replace an existing account', async () => {
  const { request } = harness()
  await request(signup)
  assert.equal((await request(signup)).statusCode, 409)
})

test('origin, password bounds, and method validation reject unsafe requests', async () => {
  const { request } = harness()
  assert.equal((await request(signup, { origin: 'https://unrelated.test' })).statusCode, 403)
  assert.equal((await request({ ...signup, password: 'short' })).statusCode, 400)
  assert.equal((await request({ ...signup, password: 'x'.repeat(129) })).statusCode, 400)
  assert.equal((await request(signup, { 'content-type': 'text/plain' })).statusCode, 415)
})

test('rate limit blocks repeated login attempts', async () => {
  const { request } = harness()
  for (let index = 0; index < 20; index++) {
    assert.equal((await request({ ...signup, action: 'login' })).statusCode, 401)
  }
  assert.equal((await request({ ...signup, action: 'login' })).statusCode, 429)
})
