import { store } from '../server/store.mjs'
import { createStatusMediaHandler } from '../server/status-media.mjs'

export const config = { api: { bodyParser: false } }
export default createStatusMediaHandler(store)
