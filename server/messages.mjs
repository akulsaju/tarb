import { createHash } from 'node:crypto'

const digest = (value) => createHash('sha256').update(value).digest('hex')
const member = ({ id, name, username }) => ({ id, name, username })
const validId = (id) => typeof id === 'string' && /^[a-f0-9]{64}$/.test(id)
class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status }
}

export function createMessagingHandler(store) {
  async function update(key, transform) {
    for (let attempt = 0; attempt < 8; attempt++) {
      const current = await store.read(key)
      const next = transform(current?.value)
      if (next === undefined) return current?.value
      if (key.startsWith('conversations/')) next.version = (current?.value.version || 0) + 1
      try {
        await store.write(key, next, current?.etag)
        return next
      } catch (error) {
        if (!store.isConflict(error)) throw error
        if (attempt < 7) await new Promise((resolve) => setTimeout(resolve, Math.min(1200, 100 * 2 ** attempt) + Math.random() * 150))
      }
    }
    console.warn('Conditional write retries exhausted:', key.split('/')[0])
    throw new HttpError(409, 'This conversation changed. Please try again.')
  }

  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    try {
      if (req.method !== 'POST') throw new HttpError(405, 'Use POST for messaging.')
      if (req.headers.origin !== `https://${req.headers.host}`) throw new HttpError(403, 'Request origin is not allowed.')
      if (!req.headers['content-type']?.startsWith('application/json')) throw new HttpError(415, 'Send JSON content.')
      if (Number(req.headers['content-length'] || 0) > 16384) throw new HttpError(413, 'Request is too large.')
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
      if (!body || JSON.stringify(body).length > 16384) throw new HttpError(400, 'Invalid request.')
      const token = req.headers.cookie?.split(';').map((part) => part.trim())
        .find((part) => part.startsWith('__Host-vybe-session='))?.slice('__Host-vybe-session='.length)
      if (!validId(token)) throw new HttpError(401, 'Please sign in again.')
      const sessionKey = `sessions/${digest(token)}.json`
      const session = (await store.read(sessionKey))?.value
      if (!session || session.expiresAt <= Date.now() || !session.accountKey) throw new HttpError(401, 'Your session expired. Please sign in again.')
      const account = (await store.read(session.accountKey))?.value
      if (!account || account.id !== session.userId) throw new HttpError(401, 'Please sign in again.')
      const inboxKey = (id) => `inboxes/${id}.json`
      const conversationKey = (id) => `conversations/${id}.json`

      if (body.action === 'sync') {
        const inbox = (await store.read(inboxKey(account.id)))?.value || []
        const chats = (await Promise.all(inbox.map(async (id) => {
          const conversation = (await store.read(conversationKey(id)))?.value
          if (!conversation?.members.some((item) => item.id === account.id)) return null
          return conversation
        }))).filter(Boolean)
        return res.status(200).json({ chats })
      }

      if (!['start', 'send', 'read', 'react'].includes(body.action)) throw new HttpError(400, 'Unknown messaging action.')
      // Bound mutations per account independently of browser-supplied network headers.
      if (body.action !== 'read') {
        const rateKey = `message-limits/${account.id}-${Math.floor(Date.now() / 60000)}.json`
        await update(rateKey, (value) => {
          if ((value?.attempts || 0) >= 60) throw new HttpError(429, 'Too many requests. Please wait a minute.')
          return { attempts: (value?.attempts || 0) + 1 }
        })
      }

      if (body.action === 'start') {
        const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
        if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Enter the registered email of your contact.')
        const recipient = (await store.read(`accounts/${digest(email)}.json`))?.value
        if (!recipient) throw new HttpError(404, 'No VYBE account found for that email.')
        if (recipient.id === account.id) throw new HttpError(400, 'Enter another person’s email.')
        const id = digest([account.id, recipient.id].sort().join(':'))
        const conversation = await update(conversationKey(id), (value) => value ? undefined : {
          id, members: [member(account), member(recipient)], messages: [], read: {},
        })
        // Each inbox is independent; a repeated start repairs a partially completed delivery.
        await Promise.all([account.id, recipient.id].map((userId) => update(inboxKey(userId), (value = []) => {
          if (value.includes(id)) return undefined
          if (value.length >= 100) throw new HttpError(409, 'This account has reached the 100-conversation limit.')
          return [...value, id]
        })))
        return res.status(200).json({ chat: conversation })
      }

      if (!validId(body.chatId)) throw new HttpError(400, 'Invalid conversation.')
      const key = conversationKey(body.chatId)
      const conversation = await update(key, (value) => {
        if (!value || !value.members.some((item) => item.id === account.id)) throw new HttpError(404, 'Conversation not found.')
        if (body.action === 'read') {
          const requested = value.messages.findIndex((message) => message.id === body.messageId) + 1
          if (requested === 0) throw new HttpError(404, 'Message not found.')
          if (requested <= (value.read[account.id] || 0)) return undefined
          return { ...value, read: { ...value.read, [account.id]: requested } }
        }
        if (body.action === 'react') {
          if (!['', '💛'].includes(body.reaction)) throw new HttpError(400, 'Invalid reaction.')
          if (!value.messages.some((message) => message.id === body.messageId)) throw new HttpError(404, 'Message not found.')
          return { ...value, messages: value.messages.map((message) => message.id === body.messageId
            ? { ...message, reactions: { ...message.reactions, [account.id]: body.reaction } } : message) }
        }
        const text = typeof body.text === 'string' ? body.text.trim() : ''
        if (!text || text.length > 4000) throw new HttpError(400, 'Messages must contain 1–4000 characters.')
        if (typeof body.messageId !== 'string' || !/^[a-f0-9-]{36}$/.test(body.messageId)) throw new HttpError(400, 'Invalid message identifier.')
        const existing = value.messages.find((message) => message.id === body.messageId)
        if (existing) {
          if (existing.senderId !== account.id || existing.text !== text || existing.replyId !== body.replyId) {
            throw new HttpError(409, 'Message identifier already used.')
          }
          return undefined
        }
        if (value.messages.length >= 1000) throw new HttpError(409, 'This conversation has reached the 1,000-message limit.')
        if (body.replyId && !value.messages.some((message) => message.id === body.replyId)) throw new HttpError(400, 'Reply message not found.')
        const message = { id: body.messageId, text, senderId: account.id, createdAt: new Date().toISOString(), ...(body.replyId ? { replyId: body.replyId } : {}), reactions: {} }
        return { ...value, messages: [...value.messages, message], read: { ...value.read, [account.id]: value.messages.length + 1 } }
      })
      return res.status(200).json({ chat: conversation })
    } catch (error) {
      if (error instanceof HttpError) return res.status(error.status).json({ error: error.message })
      if (error instanceof SyntaxError) return res.status(400).json({ error: 'Invalid JSON request.' })
      console.error('Messaging request failed:', error.name)
      return res.status(503).json({ error: 'Messaging is temporarily unavailable. Your draft has not been discarded.' })
    }
  }
}
