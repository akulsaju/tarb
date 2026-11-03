import { get, put, del } from '@vercel/blob'
import { createAuthHandler } from '../server/auth.mjs'

const store = {
  async read(path) {
    const result = await get(path, { access: 'private', useCache: false })
    if (!result) return null
    return { value: await new Response(result.stream).json(), etag: result.blob.etag }
  },
  async write(path, value, etag) {
    return put(path, JSON.stringify(value), {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: Boolean(etag),
      contentType: 'application/json',
      ...(etag ? { ifMatch: etag } : {}),
    })
  },
  async remove(path) {
    await del(path)
  },
  isConflict(error) {
    return ['BlobAlreadyExistsError', 'BlobPreconditionFailedError'].includes(error.name)
      || /already exists|precondition/i.test(error.message)
  },
}

export default createAuthHandler(store)
