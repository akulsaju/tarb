import { get, put, del } from '@vercel/blob'

export const store = {
  async read(path) {
    // Compressed responses have weak ETags that cannot be used with ifMatch.
    const result = await get(path, { access: 'private', useCache: false, headers: { 'Accept-Encoding': 'identity' } })
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
  async remove(path) { await del(path) },
  isConflict(error) {
    return ['BlobAlreadyExistsError', 'BlobPreconditionFailedError'].includes(error.name)
      || /already exists|precondition/i.test(error.message)
  },
}
