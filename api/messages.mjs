import { createMessagingHandler } from '../server/messages.mjs'
import { store } from '../server/store.mjs'

export default createMessagingHandler(store)
