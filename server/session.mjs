import { createHash } from 'node:crypto'

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status }
}

export async function requireAccount(req, store) {
  const token = req.headers.cookie?.split(';').map((part) => part.trim())
    .find((part) => part.startsWith('__Host-vybe-session='))?.slice('__Host-vybe-session='.length)
  if (!token || !/^[a-f0-9]{64}$/.test(token)) throw new HttpError(401, 'Please sign in again.')
  const hash = createHash('sha256').update(token).digest('hex')
  const session = (await store.read(`sessions/${hash}.json`))?.value
  if (!session || session.expiresAt <= Date.now() || !session.accountKey) throw new HttpError(401, 'Your session expired. Please sign in again.')
  const account = (await store.read(session.accountKey))?.value
  if (!account || account.id !== session.userId) throw new HttpError(401, 'Please sign in again.')
  return account
}
