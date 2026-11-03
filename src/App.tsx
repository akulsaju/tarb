import { useEffect, useRef, useState } from 'react'
import {
  ArrowLeft, AtSign, Check, ChevronRight, Eye, EyeOff, Info, Lock, LogOut,
  Mail, MessageCircle, Paperclip, Plus, Search, Send, Settings2, Smile, UserRound, X, CircleDot,
} from 'lucide-react'
import { Account, Profile, StatusPost, Message, Chat, ApiError, Avatar, request, errorText } from './api'
import { ProfilePanel, StatusPanel } from './ProfileStatus'

const time = (date: string) => new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
const latestMessage = (chat: Chat) => chat.messages[chat.messages.length - 1]

function AuthScreen({ onAuth }: { onAuth: (user: Account) => void }) {
  const [signup, setSignup] = useState(false)
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true); setError('')
    try {
      const result = await request('auth', { action: signup ? 'signup' : 'login', name, username, email, password })
      if (!result.user) throw new Error('The server did not return an account.')
      onAuth(result.user)
    } catch (error) { setError(errorText(error)) }
    finally { setBusy(false) }
  }
  return <main className="auth-shell dark">
    <div className="ambient ambient-one" /><div className="ambient ambient-two" />
    <section className="auth-card glass">
      <div className="brand-mark auth-brand" aria-label="VYBE">v<span>.</span></div>
      <h1>{signup ? 'Create your account' : 'Welcome back'}</h1>
      <p>{signup ? 'Your people. Your conversations.' : 'Sign in to pick up your conversations.'}</p>
      <div className="auth-tabs" role="tablist" aria-label="Account access">
        {[false, true].map((value) => <button key={String(value)} type="button" role="tab" disabled={busy}
          aria-selected={signup === value} className={signup === value ? 'active' : ''}
          onClick={() => { setSignup(value); setError('') }}>{value ? 'Create account' : 'Sign in'}</button>)}
      </div>
      <form onSubmit={submit}>
        {signup && <>
          <label className="auth-field"><UserRound size={16} /><input aria-label="Display name" placeholder="Display name"
            autoComplete="name" required minLength={2} maxLength={80} value={name} onChange={(e) => setName(e.target.value)} /></label>
          <label className="auth-field"><AtSign size={16} /><input aria-label="Display handle" placeholder="Display handle"
            autoComplete="username" required pattern="[a-z0-9_.]{3,30}" title="3–30 lowercase letters, numbers, dots or underscores"
            value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} /></label>
        </>}
        <label className="auth-field"><Mail size={16} /><input aria-label="Email" placeholder="Email address" type="email"
          required maxLength={254} autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label className="auth-field"><Lock size={16} /><input aria-label="Password" placeholder={signup ? 'Password (10+ characters)' : 'Password'}
          required minLength={10} maxLength={128} type={showPassword ? 'text' : 'password'}
          autoComplete={signup ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} />
          <button type="button" className="password-toggle" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(!showPassword)}>
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </label>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button className="auth-submit" disabled={busy}>{busy ? 'One moment…' : signup ? 'Create account' : 'Sign in'}</button>
      </form>
      <p className="auth-footnote">Accounts and messages are stored on our server, not in browser storage. Find contacts by their registered email.</p>
    </section>
  </main>
}

export default function App() {
  const [user, setUser] = useState<Account | null>(null)
  const [expired, setExpired] = useState('')
  return user ? <Workspace key={user.id} user={user} onLogout={() => { setUser(null); setExpired('') }}
    onExpired={() => { setUser(null); setExpired('Your session expired. Please sign in again.') }} />
    : <>{expired && <div className="toast" role="alert">{expired}</div>}<AuthScreen onAuth={setUser} /></>
}

function Workspace({ user, onLogout, onExpired }: { user: Account; onLogout: () => void; onExpired: () => void }) {
  const [chats, setChats] = useState<Chat[]>([])
  const [activeId, setActiveId] = useState('')
  const [tab, setTab] = useState<'Chats' | 'Status' | 'Profile'>('Chats')
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [statuses, setStatuses] = useState<StatusPost[]>([])
  const [clock, setClock] = useState(Date.now())
  const clockOffset = useRef(0)
  const [showContact, setShowContact] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [newChat, setNewChat] = useState(false)
  const [contactEmail, setContactEmail] = useState('')
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [reply, setReply] = useState<Message | null>(null)
  const [emoji, setEmoji] = useState(false)
  const [sending, setSending] = useState(false)
  const [starting, setStarting] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [syncError, setSyncError] = useState('')
  const [actionError, setActionError] = useState('')
  const [toast, setToast] = useState('')
  const [dark, setDark] = useState(true)
  const scroll = useRef<HTMLDivElement>(null)
  const atBottom = useRef(true)
  const revision = useRef(0)
  const syncing = useRef(false)
  const pendingMessage = useRef<{ chatId: string; text: string; replyId?: string; id: string } | null>(null)
  const active = chats.find((chat) => chat.id === activeId)
  const ownProfile = profiles.find((profile) => profile.id === user.id) || { ...user, photo: '', about: '', version: 0 }
  const peer = (chat: Chat) => {
    const person = chat.members.find((member) => member.id !== user.id)!
    return profiles.find((profile) => profile.id === person.id) || { ...person, photo: '', about: '', version: 0 }
  }
  const unread = (chat: Chat) => chat.messages.filter((message, index) => index >= (chat.read[user.id] || 0) && message.senderId !== user.id).length
  const draft = drafts[activeId] || ''

  function failure(error: unknown) {
    if (error instanceof ApiError && error.status === 401) onExpired()
    return errorText(error)
  }
  function merge(chat: Chat) {
    setChats((current) => {
      if (current.some((item) => item.id === chat.id && item.version > chat.version)) return current
      return [...current.filter((item) => item.id !== chat.id), chat]
    })
  }
  async function sync() {
    if (syncing.current) return
    syncing.current = true
    const version = revision.current
    try {
      const result = await request('messages', { action: 'sync' })
      if (!result.chats) throw new Error('Invalid conversation response.')
      const received = result.chats
      if (version === revision.current) {
        setChats((current) => received.map((chat) => {
          const existing = current.find((item) => item.id === chat.id)
          return existing && existing.version > chat.version ? existing : chat
        }))
        setProfiles((current) => (result.profiles || []).map((profile) => {
          const existing = current.find((item) => item.id === profile.id)
          return existing && existing.version > profile.version ? existing : profile
        }))
        setStatuses(result.statuses || [])
      }
      if (result.serverTime) {
        clockOffset.current = result.serverTime - Date.now()
        setClock(result.serverTime)
      }
      setLoaded(true); setSyncError('')
    } catch (error) { setSyncError(failure(error)) }
    finally { syncing.current = false }
  }
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now() + clockOffset.current), 15000)
    return () => clearInterval(timer)
  }, [])
  useEffect(() => {
    let disposed = false
    let timer: ReturnType<typeof setTimeout>
    async function tick() {
      if (!document.hidden) await sync()
      if (!disposed) timer = setTimeout(tick, 4000)
    }
    function resume() { if (!document.hidden) void sync() }
    void tick()
    document.addEventListener('visibilitychange', resume)
    window.addEventListener('online', resume)
    return () => { disposed = true; clearTimeout(timer); document.removeEventListener('visibilitychange', resume); window.removeEventListener('online', resume) }
    // The workspace is remounted for each authenticated account.
  }, [])
  const lastId = active && latestMessage(active)?.id
  useEffect(() => {
    atBottom.current = true
    setReply(null); setEmoji(false); setActionError(''); setShowContact(false)
    if (scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight
  }, [activeId])
  useEffect(() => {
    if (atBottom.current && scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight
  }, [lastId])
  useEffect(() => {
    if (!active || !lastId || document.hidden || !mobileOpen || tab !== 'Chats' || !unread(active)) return
    let cancelled = false
    revision.current++
    void request('messages', { action: 'read', chatId: active.id, messageId: lastId }).then((result) => {
      if (!cancelled && result.chat) { revision.current++; merge(result.chat) }
    }).catch((error: unknown) => { if (!cancelled) setSyncError(failure(error)) })
    return () => { cancelled = true }
  }, [activeId, lastId, mobileOpen, tab])
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(''), 3500)
    return () => clearTimeout(timer)
  }, [toast])

  async function start(event: React.FormEvent) {
    event.preventDefault()
    if (starting) return
    setStarting(true); setActionError(''); revision.current++
    try {
      const result = await request('messages', { action: 'start', email: contactEmail })
      if (!result.chat) throw new Error('The conversation could not be opened.')
      revision.current++; merge(result.chat); setActiveId(result.chat.id)
      setMobileOpen(true); setTab('Chats'); setNewChat(false); setContactEmail('')
    } catch (error) { setActionError(failure(error)) }
    finally { setStarting(false) }
  }
  async function send(event: React.FormEvent) {
    event.preventDefault()
    if (!active || !draft.trim() || sending) return
    const chatId = active.id, text = draft.trim(), replyId = reply?.id
    const pending = pendingMessage.current
    const id = pending?.chatId === chatId && pending.text === text && pending.replyId === replyId ? pending.id : crypto.randomUUID()
    pendingMessage.current = { chatId, text, replyId, id }
    setSending(true); setActionError(''); revision.current++
    try {
      const result = await request('messages', { action: 'send', chatId, text, messageId: id, ...(replyId ? { replyId } : {}) })
      if (!result.chat) throw new Error('Delivery was not confirmed. Retry to check without duplicating this message.')
      revision.current++; merge(result.chat)
      setDrafts((current) => current[chatId]?.trim() === text ? { ...current, [chatId]: '' } : current)
      setReply((current) => current?.id === replyId ? null : current); setEmoji(false); pendingMessage.current = null; atBottom.current = true
    } catch (error) { setActionError(failure(error)) }
    finally { setSending(false) }
  }
  async function react(message: Message) {
    if (!active) return
    revision.current++
    try {
      const result = await request('messages', { action: 'react', chatId: active.id, messageId: message.id, reaction: message.reactions[user.id] ? '' : '💛' })
      if (result.chat) { revision.current++; merge(result.chat) }
    } catch (error) { setActionError(failure(error)) }
  }
  async function logout() {
    if (loggingOut) return
    setLoggingOut(true)
    try { await request('auth', { action: 'logout' }); onLogout() }
    catch (error) { setActionError(failure(error)); setLoggingOut(false) }
  }
  const visible = chats.filter((chat) => (!unreadOnly || unread(chat) > 0) &&
    `${peer(chat).name} ${peer(chat).username} ${chat.messages.map((message) => message.text).join(' ')}`.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => (latestMessage(b)?.createdAt || '').localeCompare(latestMessage(a)?.createdAt || ''))
  const nav = [{ id: 'Chats', icon: MessageCircle }, { id: 'Status', icon: CircleDot }, { id: 'Profile', icon: Settings2 }] as const

  return <main className={`app-shell ${dark ? 'dark' : ''}`}>
    <div className="ambient ambient-one" /><div className="ambient ambient-two" />
    <div className={`app-frame ${mobileOpen && tab === 'Chats' ? 'mobile-chat-open' : ''}`}>
      <aside className="rail glass">
        <button className="brand-mark" aria-label="VYBE home" onClick={() => { setTab('Chats'); setMobileOpen(false) }}>v.</button>
        <nav className="rail-nav">{nav.map(({ id, icon: Icon }) => <button key={id} className={`rail-button ${tab === id ? 'selected' : ''}`}
          aria-label={id} onClick={() => { setTab(id); setMobileOpen(false) }}><Icon size={20} /></button>)}</nav>
        <button className="profile-button rail-bottom" aria-label="Your profile" onClick={() => { setTab('Profile'); setMobileOpen(false) }}><Avatar name={ownProfile.name} photo={ownProfile.photo} /></button>
      </aside>
      <section className="sidebar glass">
        <div className="sidebar-topline"><span className="eyebrow">YOUR SPACE</span><span className="connection-label">{syncError ? 'Reconnecting' : loaded ? 'Server connected' : 'Connecting…'}</span></div>
        <div className="sidebar-heading"><div><h1>{tab === 'Chats' ? 'Messages' : tab === 'Status' ? 'Status' : 'Your profile'}</h1><p>{tab === 'Status' ? 'Little moments, for 24 hours.' : 'Good conversations live here.'}</p></div>
          <button className="round-button compose" aria-label="New conversation" onClick={() => { setNewChat(true); setActionError('') }}><Plus size={20} /></button></div>
        {tab === 'Chats' ? <>
          <label className="search-field"><Search size={17} /><input aria-label="Search conversations" placeholder="Search conversations" value={search} onChange={(e) => setSearch(e.target.value)} /></label>
          <div className="filter-row">{[false, true].map((value) => <button className={`filter-chip ${unreadOnly === value ? 'active' : ''}`} key={String(value)}
            onClick={() => setUnreadOnly(value)}>{value ? 'Unread' : 'All'}</button>)}</div>
          {syncError && <div className="service-error" role="alert">{syncError}<button onClick={() => void sync()}>Retry</button></div>}
          <div className="chat-list lower-list">
            {!loaded && !syncError && <p className="empty-search">Loading conversations…</p>}
            {visible.map((chat) => {
              const person = peer(chat), latest = latestMessage(chat), count = unread(chat)
              return <button key={chat.id} className={`chat-row ${activeId === chat.id ? 'active' : ''}`} onClick={() => { setActiveId(chat.id); setMobileOpen(true) }}>
                <Avatar name={person.name} photo={person.photo} /><span className="chat-row-body"><span className="chat-row-name">{person.name}</span><span className="chat-preview">{latest?.text || person.about || 'Say hello'}</span></span>
                <span className="chat-row-meta"><span>{latest ? time(latest.createdAt) : ''}</span>{count > 0 && <b>{count}</b>}</span>
              </button>
            })}
            {loaded && !visible.length && <div className="real-empty"><MessageCircle size={30} /><h3>{chats.length ? 'No matching conversations' : 'Your first hello starts here'}</h3>
              <p>{chats.length ? 'Try another search or filter.' : 'Start a conversation using a friend’s registered email.'}</p>
              {!chats.length && <button className="outline-action" onClick={() => setNewChat(true)}><Plus size={16} /> New conversation</button>}</div>}
          </div>
          <div className="sidebar-footer">Synced every 4 seconds while open</div>
        </> : tab === 'Status' ? <StatusPanel userId={user.id} dark={dark} profiles={[ownProfile, ...profiles.filter((profile) => profile.id !== user.id)]}
          posts={statuses.filter((post) => post.expiresAt > clock)} now={clock} onError={failure}
          onMutate={() => { revision.current++ }} onChanged={(posts) => {
            revision.current++; setStatuses((current) => [...current.filter((post) => post.userId !== user.id), ...posts])
          }} /> : <ProfilePanel profile={ownProfile} email={user.email} loaded={loaded} dark={dark} onTheme={() => setDark(!dark)}
            onError={failure} onMutate={() => { revision.current++ }} onSaved={(profile) => {
              revision.current++; setProfiles((current) => [...current.filter((item) => item.id !== user.id), profile])
            }} />}
        {tab !== 'Chats' && syncError && <div className="service-error" role="alert">{syncError}<button onClick={() => void sync()}>Retry</button></div>}
        {tab === 'Profile' && <div className="profile-session"><button className="settings-row logout-row" disabled={loggingOut} onClick={() => void logout()}><LogOut size={18} /><span>{loggingOut ? 'Signing out…' : 'Sign out'}</span></button>
          {actionError && <p className="service-error" role="alert">{actionError}</p>}</div>}
      </section>
      <section className="conversation glass">
        {tab !== 'Chats' ? <div className="conversation-welcome"><div className="feature-mark">{tab === 'Status' ? <CircleDot size={36} /> : <UserRound size={36} />}</div>
          <h2>{tab === 'Status' ? 'A moment worth sharing.' : 'Make this space yours.'}</h2><p>{tab === 'Status' ? 'Share a text update with your conversation contacts. Posts disappear from view after 24 hours.' : 'Change your photo, name and profile status. Your contacts see the latest version across VYBE.'}</p></div> : active ? <>
          <header className="chat-header">
            <button className="chat-person contact-heading" aria-label="View contact profile" onClick={() => setShowContact(true)}><Avatar name={peer(active).name} photo={peer(active).photo} /><span><h2>{peer(active).name}</h2><span className="contact-subtitle">{peer(active).about || `@${peer(active).username}`}</span></span></button>
            <div className="header-actions"><button className="icon-button" aria-label="Conversation information" onClick={() => setToast('Stored on the VYBE server. Not end-to-end encrypted. Updates checked every 4 seconds.')}><Info size={20} /></button>
              <button className="icon-button mobile-back" aria-label="Back to conversations" onClick={() => setMobileOpen(false)}><ArrowLeft size={20} /></button></div>
          </header>
          <div className="message-scroll" ref={scroll} onScroll={() => { const node = scroll.current; if (node) atBottom.current = node.scrollHeight - node.scrollTop - node.clientHeight < 100 }}>
            {!active.messages.length && <div className="real-empty"><Avatar name={peer(active).name} photo={peer(active).photo} /><h3>Say hello to {peer(active).name}</h3><p>Your messages will appear on both accounts.</p></div>}
            {active.messages.map((message, index) => {
              const mine = message.senderId === user.id
              const quote = active.messages.find((item) => item.id === message.replyId)
              const reactions = Object.values(message.reactions).filter(Boolean)
              const showDate = index === 0 || new Date(active.messages[index - 1].createdAt).toDateString() !== new Date(message.createdAt).toDateString()
              return <div key={message.id}>
                {showDate && <div className="message-date">{new Date(message.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}</div>}
                <div className={`message-line ${mine ? 'mine' : ''} group-end`}>
                  {!mine && <Avatar name={peer(active).name} photo={peer(active).photo} />}
                  <div className="message-column">
                    <div className={`message-bubble ${mine ? 'sent' : 'received'}`}>
                      {quote && <div className="reply-quote">{quote.text}</div>}<span className="message-text">{message.text}</span>
                      <span className="message-time">{time(message.createdAt)}{mine && <Check size={13} aria-label="Stored on server" />}</span>
                      {reactions.length > 0 && <span className="reaction-pill">💛 <small>{reactions.length}</small></span>}
                    </div>
                    <div className="message-tools"><button aria-label="Reply to message" onClick={() => setReply(message)}><MessageCircle size={14} /></button>
                      <button aria-label={message.reactions[user.id] ? 'Remove reaction' : 'React to message'} onClick={() => void react(message)}><Smile size={14} /></button></div>
                  </div>
                </div>
              </div>
            })}
          </div>
          <div className="composer-wrap">
            {syncError && <div className="service-error" role="alert">{syncError}<button onClick={() => void sync()}>Retry</button></div>}
            {actionError && !newChat && <div className="service-error" role="alert">{actionError}</div>}
            {reply && <div className="reply-bar"><div><span>REPLYING</span><p>{reply.text}</p></div><button aria-label="Cancel reply" onClick={() => setReply(null)}><X size={16} /></button></div>}
            <form className="composer" onSubmit={send}>
              <button type="button" className="icon-button composer-attach" aria-label="Attachments unavailable" title="File uploads are not available yet" onClick={() => setToast('File uploads are not available yet. You can send text and links.')}><Paperclip size={19} /></button>
              <div className="composer-input"><input aria-label="Write a message" placeholder="Write a message…" maxLength={4000} value={draft}
                onChange={(e) => setDrafts((current) => ({ ...current, [activeId]: e.target.value }))} />
                <button type="button" className="emoji-button" aria-label="Choose emoji" onClick={() => setEmoji(!emoji)}><Smile size={18} /></button></div>
              {emoji && <div className="emoji-picker">{['😊', '💛', '✨', '😂', '🙌', '❤️'].map((value) => <button type="button" key={value}
                onClick={() => setDrafts((current) => ({ ...current, [activeId]: (current[activeId] || '').slice(0, 3996) + value }))}>{value}</button>)}</div>}
              <button type="submit" className="send-button ready" aria-label="Send message" disabled={sending || !draft.trim()}><Send size={17} /></button>
            </form>
            <div className="composer-hint">{sending ? 'Saving to server…' : 'Enter to send · A check means stored on server'}</div>
          </div>
        </> : <div className="conversation-welcome"><div className="brand-mark">v.</div><h2>A little closer, wherever you are.</h2><p>Choose a conversation or start one with a friend on VYBE.</p>
          <button className="outline-action" onClick={() => { setNewChat(true); setActionError('') }}><Plus size={16} /> New conversation</button></div>}
      </section>
    </div>
    <nav className="mobile-tabs glass">{nav.map(({ id, icon: Icon }) => <button key={id} className={tab === id ? 'active' : ''} aria-label={id}
      onClick={() => { setTab(id); setMobileOpen(false) }}><Icon size={20} /><span>{id}</span></button>)}</nav>
    {newChat && <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && !starting) setNewChat(false) }}>
      <section className="new-chat glass" role="dialog" aria-modal="true" aria-labelledby="new-chat-title">
        <div className="modal-head"><div><span className="eyebrow">MAKE A CONNECTION</span><h2 id="new-chat-title">New message</h2></div>
          <button className="icon-button" aria-label="Close" disabled={starting} onClick={() => setNewChat(false)}><X size={19} /></button></div>
        <p className="contact-instructions">Enter your friend’s registered VYBE email. Only you and that account can access this conversation.</p>
        <form onSubmit={start}><label className="search-field modal-search"><Mail size={17} /><input autoFocus aria-label="Contact email" placeholder="friend@example.com" type="email" required maxLength={254}
          value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} /></label>
          {actionError && <p className="service-error" role="alert">{actionError}</p>}
          <button className="auth-submit" disabled={starting}>{starting ? 'Opening…' : 'Start conversation'}<ChevronRight size={17} /></button></form>
      </section>
    </div>}
    {showContact && active && <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setShowContact(false) }}>
      <section className="new-chat glass" role="dialog" aria-modal="true" aria-labelledby="contact-profile-title">
        <div className="modal-head"><h2 id="contact-profile-title">Contact profile</h2><button className="icon-button" aria-label="Close contact profile" onClick={() => setShowContact(false)}><X size={20} /></button></div>
        <div className="profile-info"><Avatar name={peer(active).name} photo={peer(active).photo} /><h2>{peer(active).name}</h2><p>@{peer(active).username}</p></div>
        <div className="profile-group"><h3>Profile status</h3><p className="about-text">{peer(active).about || 'No profile status yet.'}</p></div>
        <p className="contact-instructions">Connected through your private conversation.</p>
      </section>
    </div>}
    {toast && <div className="toast" role="status">{toast}</div>}
  </main>
}
