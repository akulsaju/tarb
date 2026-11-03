import { createAuthHandler } from '../server/auth.mjs'
import { store } from '../server/store.mjs'

export default createAuthHandler(store)
