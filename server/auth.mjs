import { createHash, randomBytes, randomUUID, scrypt as deriveKey, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(deriveKey)
const COOKIE = '__Host-vybe-session'
const SESSION_MS = 12 * 60 * 60 * 1000
const digest = (value) => createHash('sha256').update(value).digest('hex')
const publicAccount = ({ id, name, username, email }) => ({ id, name, username, email })

class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

export function createAuthHandler(store) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    try {
      if (req.method !== 'POST') throw new HttpError(405, 'Use POST for authentication.')
      const expectedOrigin = `https://${req.headers.host}`
      if (req.headers.origin !== expectedOrigin) throw new HttpError(403, 'Request origin is not allowed.')
      if (!req.headers['content-type']?.startsWith('application/json')) {
        throw new HttpError(415, 'Send JSON content.')
      }
      if (Number(req.headers['content-length'] || 0) > 8192) throw new HttpError(413, 'Request is too large.')
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
      if (!body || JSON.stringify(body).length > 8192) throw new HttpError(400, 'Invalid request.')
      const { action } = body
      const sessionToken = req.headers.cookie?.split(';').map((part) => part.trim())
        .find((part) => part.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1)

      if (action === 'logout') {
        if (sessionToken && /^[a-f0-9]{64}$/.test(sessionToken)) {
          await store.remove(`sessions/${digest(sessionToken)}.json`)
        }
        res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`)
        return res.status(200).json({ ok: true })
      }

      if (!['signup', 'login'].includes(action)) throw new HttpError(400, 'Unknown authentication action.')
      const ip = req.headers['x-vercel-forwarded-for'] || req.socket?.remoteAddress || 'unknown'
      const bucket = Math.floor(Date.now() / (15 * 60 * 1000))
      const rateKey = `limits/${digest(`${ip}:${bucket}`)}.json`
      const rate = await store.read(rateKey)
      if (rate && rate.value.attempts >= 20) throw new HttpError(429, 'Too many attempts. Try again in 15 minutes.')
      try {
        await store.write(rateKey, { attempts: (rate?.value.attempts || 0) + 1 }, rate?.etag)
      } catch (error) {
        if (store.isConflict(error)) throw new HttpError(429, 'Please wait a moment before trying again.')
        throw error
      }

      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
      const password = typeof body.password === 'string' ? body.password : ''
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
        throw new HttpError(400, 'Enter a valid email address.')
      }
      if (password.length < 10 || password.length > 128) {
        throw new HttpError(400, 'Use a password between 10 and 128 characters.')
      }
      const accountKey = `accounts/${digest(email)}.json`
      let account
      if (action === 'signup') {
        const name = typeof body.name === 'string' ? body.name.trim() : ''
        const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : ''
        if (name.length < 2 || name.length > 80) throw new HttpError(400, 'Enter a name between 2 and 80 characters.')
        if (!/^[a-z0-9_.]{3,30}$/.test(username)) throw new HttpError(400, 'Use 3-30 letters, numbers, dots or underscores for your display handle.')
        const salt = randomBytes(16).toString('hex')
        const hash = Buffer.from(await scrypt(password, salt, 64)).toString('hex')
        account = { id: randomUUID(), name, username, email, salt, hash, createdAt: new Date().toISOString() }
        try {
          await store.write(accountKey, account)
        } catch (error) {
          if (store.isConflict(error)) throw new HttpError(409, 'An account already exists for this email. Please sign in.')
          throw error
        }
      } else {
        const saved = await store.read(accountKey)
        account = saved?.value
        const candidate = Buffer.from(await scrypt(password, account?.salt || 'unregistered-account', 64))
        const expected = account ? Buffer.from(account.hash, 'hex') : Buffer.alloc(64)
        if (!account || !timingSafeEqual(candidate, expected)) throw new HttpError(401, 'Incorrect email or password.')
      }

      const token = randomBytes(32).toString('hex')
      if (sessionToken && /^[a-f0-9]{64}$/.test(sessionToken)) {
        await store.remove(`sessions/${digest(sessionToken)}.json`)
      }
      await store.write(`sessions/${digest(token)}.json`, {
        userId: account.id, accountKey, expiresAt: Date.now() + SESSION_MS,
      })
      res.setHeader('Set-Cookie', `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_MS / 1000}`)
      return res.status(200).json({ user: publicAccount(account) })
    } catch (error) {
      if (error instanceof HttpError) return res.status(error.status).json({ error: error.message })
      if (error instanceof SyntaxError) return res.status(400).json({ error: 'Invalid JSON request.' })
      console.error('Authentication request failed:', error.name)
      return res.status(503).json({ error: 'The account service is unavailable. Please try again shortly.' })
    }
  }
}
