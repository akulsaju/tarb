import { createHash } from 'node:crypto'
import { HttpError, requireAccount } from './session.mjs'

export const MAX_MEDIA_BYTES = 3 * 1024 * 1024
export const mediaKey = (id) => `status-assets/${id}.json`
export const validMediaId = (id) => typeof id === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id)
const hash = (value) => createHash('sha256').update(value).digest('hex')
const types = {
  'image/jpeg': (bytes) => bytes[0] === 255 && bytes[1] === 216 && bytes[bytes.length - 2] === 255 && bytes[bytes.length - 1] === 217,
  'image/png': (bytes) => bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
  'image/webp': (bytes) => bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP',
  'video/mp4': (bytes) => bytes.toString('ascii', 4, 8) === 'ftyp' && !bytes.toString('ascii', 8, 12).startsWith('qt'),
  'video/webm': (bytes) => bytes.subarray(0, 4).equals(Buffer.from([26, 69, 223, 163])) && bytes.subarray(0, 4096).includes(Buffer.from('webm')),
}

export function createStatusMediaHandler(store) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'private, no-store')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin')
    try {
      if (!['GET', 'HEAD', 'POST'].includes(req.method)) throw new HttpError(405, 'Use GET or POST for status media.')
      if (req.method === 'POST' && req.headers.origin !== `https://${req.headers.host}`) throw new HttpError(403, 'Request origin is not allowed.')
      const account = await requireAccount(req, store)
      const id = new URL(req.url, 'https://vybe.invalid').searchParams.get('id')
      if (!validMediaId(id)) throw new HttpError(400, 'Invalid media identifier.')
      const key = mediaKey(id)

      if (req.method === 'POST') {
        const contentType = req.headers['content-type']?.split(';')[0]
        if (!Object.hasOwn(types, contentType || '')) throw new HttpError(415, 'Choose JPEG, PNG, WebP, MP4 or WebM media.')
        if (Number(req.headers['content-length'] || 0) > MAX_MEDIA_BYTES) throw new HttpError(413, 'Status media must be 3 MB or smaller.')
        // One immutable upload per identifier. Retries return its metadata, never replace bytes.
        const existing = (await store.read(key))?.value
        if (existing) {
          if (existing.userId !== account.id || existing.expiresAt <= Date.now()) throw new HttpError(409, 'Choose your media again before posting.')
          return res.status(200).json({ media: { id, kind: existing.kind } })
        }
        const rateKey = `media-limits/${account.id}-${Math.floor(Date.now() / 3600000)}.json`
        const rate = await store.read(rateKey)
        if ((rate?.value.attempts || 0) >= 20) throw new HttpError(429, 'Upload limit reached. Try again in an hour.')
        try {
          await store.write(rateKey, { attempts: (rate?.value.attempts || 0) + 1 }, rate?.etag)
        } catch (error) {
          if (store.isConflict(error)) throw new HttpError(429, 'Another upload is in progress. Please retry.')
          throw error
        }
        const chunks = []
        let length = 0
        for await (const chunk of req) {
          const bytes = Buffer.from(chunk)
          length += bytes.length
          if (length > MAX_MEDIA_BYTES) throw new HttpError(413, 'Status media must be 3 MB or smaller.')
          chunks.push(bytes)
        }
        const bytes = Buffer.concat(chunks)
        if (bytes.length < 12 || !types[contentType](bytes)) throw new HttpError(400, 'The file does not match the selected image or video format.')
        const kind = contentType.startsWith('image/') ? 'photo' : 'video'
        const path = `status-files/${account.id}/${id}`
        try {
          await store.writeMedia(path, bytes, contentType)
        } catch (error) {
          if (store.isConflict(error)) throw new HttpError(409, 'This upload is already in progress. Retry in a moment.')
          throw error
        }
        try {
          await store.write(key, { id, userId: account.id, path, contentType, kind, size: bytes.length, expiresAt: Date.now() + 48 * 3600000 })
        } catch (error) {
          console.error('Status media metadata save failed:', error.name)
          await store.remove(path)
          throw error
        }
        return res.status(200).json({ media: { id, kind } })
      }

      const asset = (await store.read(key))?.value
      if (!asset || asset.expiresAt <= Date.now()) throw new HttpError(404, 'This media has expired or was deleted.')
      const posts = (await store.read(`statuses/${asset.userId}.json`))?.value || []
      if (!posts.some((post) => post.id === id && post.media?.id === id && post.expiresAt > Date.now())) throw new HttpError(404, 'This status has expired or was deleted.')
      if (account.id !== asset.userId) {
        const chatId = hash([account.id, asset.userId].sort().join(':'))
        const chat = (await store.read(`conversations/${chatId}.json`))?.value
        if (!chat?.members.some((person) => person.id === account.id) || !chat.members.some((person) => person.id === asset.userId)) {
          throw new HttpError(404, 'Status media not found.')
        }
      }
      const bytes = await store.readMedia(asset.path)
      if (!bytes) throw new HttpError(404, 'Status media not found.')
      res.setHeader('Content-Type', asset.contentType)
      res.setHeader('Accept-Ranges', 'bytes')
      res.setHeader('Content-Disposition', 'inline')
      const range = req.headers.range
      if (range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(range)
        let start = 0, end = bytes.length - 1
        if (!match || (!match[1] && !match[2])) throw new HttpError(416, 'Invalid media range.')
        if (!match[1]) start = Math.max(0, bytes.length - Number(match[2]))
        else { start = Number(match[1]); if (match[2]) end = Math.min(end, Number(match[2])) }
        if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= bytes.length || end < start) {
          res.setHeader('Content-Range', `bytes */${bytes.length}`)
          throw new HttpError(416, 'Invalid media range.')
        }
        res.setHeader('Content-Range', `bytes ${start}-${end}/${bytes.length}`)
        res.setHeader('Content-Length', end - start + 1)
        return res.status(206).end(req.method === 'HEAD' ? undefined : bytes.subarray(start, end + 1))
      }
      res.setHeader('Content-Length', bytes.length)
      return res.status(200).end(req.method === 'HEAD' ? undefined : bytes)
    } catch (error) {
      res.removeHeader?.('Content-Length')
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      if (error instanceof HttpError) return res.status(error.status).json({ error: error.message })
      console.error('Status media request failed:', error.name)
      return res.status(503).json({ error: 'Could not load or upload status media. Please retry.' })
    }
  }
}
