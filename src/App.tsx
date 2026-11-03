import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Archive, ArrowLeft, AtSign, Bell, Bookmark, CalendarDays, Check, CheckCheck,
  ChevronDown, ChevronRight, CircleHelp, Eye, EyeOff, Hash, Image, Info, ListFilter,
  Lock, LockKeyhole, LogOut, Mail, MessageCircle, Mic, MoreHorizontal, Paperclip,
  Phone, Plus, Search, Send, Settings2, Smile, Sparkles, UserRound, Video, X, Zap,
} from 'lucide-react'

type Message = {
  id: string
  text: string
  mine: boolean
  time: string
  reply?: string
  reaction?: string
}

type Chat = {
  id: string
  name: string
  initials: string
  color: string
  preview: string
  time: string
  unread: number
  online?: boolean
  group?: boolean
  pinned?: boolean
  messages: Message[]
}

const initialChats: Chat[] = [
  {
    id: 'maya', name: 'Maya Chen', initials: 'MC', color: 'coral', preview: 'You have to see this place ✨',
    time: 'now', unread: 2, online: true, pinned: true,
    messages: [
      { id: 'm1', text: 'Okay, I found our little weekend escape 🌿', mine: false, time: '10:24' },
      { id: 'm2', text: 'The one with the cabin by the lake?', mine: true, time: '10:26' },
      { id: 'm3', text: 'That’s the one. Look at this view.', mine: false, time: '10:27', reaction: '💛' },
      { id: 'm4', text: 'You have to see this place ✨', mine: false, time: '10:31' },
    ],
  },
  {
    id: 'weekenders', name: 'The Weekenders', initials: 'TW', color: 'violet', preview: 'Noah: Saturday, 9am. Coffee first?',
    time: '9:42', unread: 4, group: true, pinned: true,
    messages: [
      { id: 'w1', text: 'Anyone up for a little day trip this weekend?', mine: false, time: '9:16' },
      { id: 'w2', text: 'I’m in! Where are we thinking?', mine: true, time: '9:22' },
      { id: 'w3', text: 'Saturday, 9am. Coffee first?', mine: false, time: '9:42' },
    ],
  },
  {
    id: 'noah', name: 'Noah Williams', initials: 'NW', color: 'blue', preview: 'Sent a voice message · 0:18',
    time: '8:18', unread: 0, online: true,
    messages: [
      { id: 'n1', text: 'The new playlist is perfect for the drive.', mine: false, time: '8:10' },
      { id: 'n2', text: 'Sent a voice message · 0:18', mine: false, time: '8:18' },
    ],
  },
  {
    id: 'studio', name: 'Studio People', initials: 'SP', color: 'gold', preview: 'Ari: Dropping the new moodboard here',
    time: 'Yesterday', unread: 0, group: true,
    messages: [{ id: 's1', text: 'Dropping the new moodboard here', mine: false, time: 'Yesterday' }],
  },
  {
    id: 'ellie', name: 'Ellie Park', initials: 'EP', color: 'pink', preview: 'That made my whole day 🥹',
    time: 'Yesterday', unread: 0,
    messages: [
      { id: 'e1', text: 'I saved you the last slice 🍰', mine: false, time: 'Yesterday' },
      { id: 'e2', text: 'That made my whole day 🥹', mine: true, time: 'Yesterday' },
    ],
  },
  {
    id: 'family', name: 'Sunday Lunch Club', initials: 'SL', color: 'green', preview: 'Dad: See you all on Sunday!',
    time: 'Tue', unread: 0, group: true,
    messages: [{ id: 'f1', text: 'See you all on Sunday!', mine: false, time: 'Tue' }],
  },
]

const navItems = [
  { id: 'Chats', icon: MessageCircle },
  { id: 'Calls', icon: Phone },
  { id: 'Communities', icon: Hash },
  { id: 'Updates', icon: Zap },
  { id: 'Profile', icon: Settings2 },
] as const

const people = [
  { name: 'Maya Chen', initials: 'MC', color: 'coral' },
  { name: 'Noah Williams', initials: 'NW', color: 'blue' },
  { name: 'Ellie Park', initials: 'EP', color: 'pink' },
  { name: 'Ari Patel', initials: 'AP', color: 'green' },
]

function Avatar({ initials, color, size = 'regular', online = false }: {
  initials: string; color: string; size?: 'small' | 'regular' | 'large'; online?: boolean
}) {
  return (
    <span className={`avatar avatar-${color} avatar-${size}`}>
      {initials}
      {online && <i className="online-dot" />}
    </span>
  )
}

function formatTime() {
  return new Intl.DateTimeFormat([], { hour: 'numeric', minute: '2-digit' }).format(new Date())
}

type Account = {
  id: string
  name: string
  username: string
  email: string
}

async function authenticate(body: Record<string, string>) {
  const response = await fetch('/api/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    cache: 'no-store',
    body: JSON.stringify(body),
  })
  if (!response.headers.get('content-type')?.includes('application/json')) {
    throw new Error('The account service is unavailable. Please try again shortly.')
  }
  const result = await response.json() as { user?: Account; error?: string }
  if (!response.ok) throw new Error(result.error || 'Unable to complete authentication.')
  return result
}

function initialsOf(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('') || 'V'
}

function useThemePreference() {
  const [themePref, setThemePref] = useState<'system' | 'light' | 'dark'>(() => {
    const urlTheme = new URLSearchParams(window.location.search).get('theme')
    if (urlTheme === 'dark' || urlTheme === 'light') return urlTheme
    return 'dark'
  })
  const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches)
  const darkMode = themePref === 'dark' || (themePref === 'system' && systemDark)

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  function cycleTheme() {
    setThemePref((current) => current === 'system' ? 'light' : current === 'light' ? 'dark' : 'system')
  }

  return { darkMode, themePref, cycleTheme }
}

function AuthScreen({ dark, onAuth }: { dark: boolean; onAuth: (account: Account) => void }) {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  function switchMode(next: 'login' | 'signup') {
    setMode(next)
    setError('')
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (busy) return
    setError('')
    setBusy(true)
    try {
      if (mode === 'signup') {
        const trimmedName = name.trim()
        const trimmedUsername = username.trim().toLowerCase().replace(/[^a-z0-9_.]/g, '')
        const trimmedEmail = email.trim().toLowerCase()
        if (trimmedName.length < 2) throw new Error('Please enter your name.')
        if (trimmedUsername.length < 3) throw new Error('Username needs at least 3 letters or numbers.')
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) throw new Error('Please enter a valid email address.')
        if (password.length < 10) throw new Error('Password needs at least 10 characters.')
        const result = await authenticate({
          action: 'signup', name: trimmedName, username: trimmedUsername,
          email: trimmedEmail, password,
        })
        if (!result.user) throw new Error('The server did not return an account.')
        onAuth(result.user)
      } else {
        const id = identifier.trim().toLowerCase()
        if (!id || !password) throw new Error('Enter your email and password.')
        const result = await authenticate({ action: 'login', email: id, password })
        if (!result.user) throw new Error('The server did not return an account.')
        onAuth(result.user)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className={dark ? 'auth-shell dark' : 'auth-shell'}>
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <section className="auth-card glass">
        <a className="brand-mark auth-brand" href="#" onClick={(event) => event.preventDefault()} aria-label="VYBE">v<span>.</span></a>
        <h1>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h1>
        <p>{mode === 'login' ? 'Sign in to pick up your conversations.' : 'Join VYBE and start your first conversation.'}</p>
        <div className="auth-tabs" role="tablist">
          <button role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'active' : ''} onClick={() => switchMode('login')}>Sign in</button>
          <button role="tab" aria-selected={mode === 'signup'} className={mode === 'signup' ? 'active' : ''} onClick={() => switchMode('signup')}>Create account</button>
        </div>
        <form onSubmit={handleSubmit} noValidate>
          {mode === 'signup' && (
            <>
              <label className="auth-field"><UserRound size={16} />
                <input aria-label="Display name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Display name" autoComplete="name" maxLength={80} />
              </label>
              <label className="auth-field"><AtSign size={16} />
                <input aria-label="Display handle" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Display handle" autoComplete="username" maxLength={30} />
              </label>
              <label className="auth-field"><Mail size={16} />
                <input aria-label="Email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email" type="email" autoComplete="email" maxLength={254} />
              </label>
            </>
          )}
          {mode === 'login' && (
            <label className="auth-field"><UserRound size={16} />
              <input aria-label="Email" value={identifier} onChange={(event) => setIdentifier(event.target.value)} placeholder="Email address" type="email" autoComplete="username" maxLength={254} />
            </label>
          )}
          <label className="auth-field"><Lock size={16} />
            <input aria-label="Password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder={mode === 'signup' ? 'Password (10+ characters)' : 'Password'} maxLength={128} type={showPassword ? 'text' : 'password'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
            <button type="button" className="password-toggle" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(!showPassword)}>
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </label>
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button className="auth-submit" type="submit" disabled={busy}>
            {busy ? 'One moment…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>
        <p className="auth-footnote">Your account is stored on our server, not in this browser. Sign in with your email on any device.</p>
      </section>
    </main>
  )
}

export default function App() {
  const { darkMode, themePref, cycleTheme } = useThemePreference()
  const [user, setUser] = useState<Account | null>(null)
  const [logoutError, setLogoutError] = useState('')

  async function handleLogout() {
    try {
      await authenticate({ action: 'logout' })
      setLogoutError('')
      setUser(null)
    } catch (error) {
      setLogoutError(error instanceof Error ? error.message : 'Unable to sign out. Please try again.')
    }
  }

  if (!user) {
    return <AuthScreen dark={darkMode} onAuth={setUser} />
  }
  return <><VybeApp key={user.id} user={user} darkMode={darkMode} themePref={themePref} onToggleTheme={cycleTheme} onLogout={handleLogout} />
    {logoutError && <div className="toast" role="alert">{logoutError}</div>}</>
}

function VybeApp({ user, darkMode, themePref, onToggleTheme, onLogout }: {
  user: Account
  darkMode: boolean
  themePref: 'system' | 'light' | 'dark'
  onToggleTheme: () => void
  onLogout: () => void
}) {
  const [chats, setChats] = useState<Chat[]>(initialChats)
  const [activeId, setActiveId] = useState('maya')
  const [activeTab, setActiveTab] = useState<(typeof navItems)[number]['id']>('Chats')
  const [search, setSearch] = useState('')
  const [contactSearch, setContactSearch] = useState('')
  const [chatFilter, setChatFilter] = useState<'All' | 'Unread' | 'Groups'>('All')
  const [mobileChatOpen, setMobileChatOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [replyTo, setReplyTo] = useState<Message | null>(null)
  const [showNewChat, setShowNewChat] = useState(false)
  const [showDetails, setShowDetails] = useState(false)
  const [showEmoji, setShowEmoji] = useState(false)
  const [call, setCall] = useState<'voice' | 'video' | null>(null)
  const [toast, setToast] = useState('')
  const searchInput = useRef<HTMLInputElement>(null)
  const contactSearchInput = useRef<HTMLInputElement>(null)
  const messagesEnd = useRef<HTMLDivElement>(null)
  const activeChat = chats.find((chat) => chat.id === activeId) ?? chats[0]
  const visibleChats = useMemo(() => chats
    .filter((chat) => chat.name.toLowerCase().includes(search.toLowerCase())
      || chat.messages.some((message) => message.text.toLowerCase().includes(search.toLowerCase())))
    .filter((chat) => chatFilter === 'All' || (chatFilter === 'Unread' ? chat.unread > 0 : chat.group))
    .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned))), [chats, search, chatFilter])

  useEffect(() => {
    const container = messagesEnd.current?.closest('.message-scroll')
    if (container) container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' })
  }, [activeId, chats])

  useEffect(() => {
    function handleSearchShortcut(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        if (showNewChat) contactSearchInput.current?.focus()
        else searchInput.current?.focus()
      }
    }
    window.addEventListener('keydown', handleSearchShortcut)
    return () => window.removeEventListener('keydown', handleSearchShortcut)
  }, [showNewChat])

  function notify(message: string) {
    setToast(message)
    window.setTimeout(() => setToast(''), 2400)
  }

  function sendMessage(text = draft) {
    const trimmed = text.trim()
    if (!trimmed || !activeChat) return
    const message: Message = {
      id: crypto.randomUUID(),
      text: trimmed,
      mine: true,
      time: formatTime(),
      reply: replyTo?.text,
    }
    setChats((current) => current.map((chat) => chat.id === activeId
      ? { ...chat, preview: trimmed, time: 'now', unread: 0, messages: [...chat.messages, message] }
      : chat))
    setDraft('')
    setReplyTo(null)
    setShowEmoji(false)
  }

  function startChat(person: typeof people[number]) {
    let chat = chats.find((item) => item.name === person.name)
    if (!chat) {
      chat = {
        id: person.name.toLowerCase().replace(/ /g, '-'),
        name: person.name, initials: person.initials, color: person.color, preview: 'Start a conversation',
        time: 'now', unread: 0, online: true, messages: [],
      }
      setChats((current) => [chat!, ...current])
    }
    setActiveId(chat.id)
    setActiveTab('Chats')
    setMobileChatOpen(true)
    setShowNewChat(false)
    setSearch('')
    setContactSearch('')
  }

  function selectChat(id: string) {
    setActiveId(id)
    setMobileChatOpen(true)
    setChats((current) => current.map((chat) => chat.id === id ? { ...chat, unread: 0 } : chat))
  }

  function openCall(type: 'voice' | 'video') {
    setCall(type)
  }

  return (
    <main className={darkMode ? 'app-shell dark' : 'app-shell'}>
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <div className={`app-frame ${mobileChatOpen && activeTab === 'Chats' ? 'mobile-chat-open' : ''}`}>
        <aside className="rail glass">
          <a className="brand-mark" href="#" aria-label="VYBE home" onClick={(event) => {
            event.preventDefault()
            setActiveTab('Chats')
          }}>v<span>.</span></a>
          <div className="rail-nav">
            {navItems.map(({ id, icon: Icon }) => (
              <button key={id} className={`rail-button ${activeTab === id ? 'selected' : ''}`}
                title={id} aria-label={id} onClick={() => { setActiveTab(id); setMobileChatOpen(false) }}>
                <Icon size={20} strokeWidth={activeTab === id ? 2.3 : 1.8} />
                {id === 'Chats' && <span className="rail-indicator" />}
              </button>
            ))}
          </div>
          <div className="rail-bottom">
            <button className="rail-button" title="Help" aria-label="Help" onClick={() => notify('VYBE help center — coming soon')}><CircleHelp size={20} /></button>
            <button className="profile-button" title="Your profile" aria-label="Your profile" onClick={() => { setActiveTab('Profile'); setMobileChatOpen(false) }}>
              <Avatar initials={initialsOf(user.name)} color="lavender" />
            </button>
          </div>
        </aside>

        <section className="sidebar glass">
          <div className="sidebar-topline">
            <span className="eyebrow">YOUR SPACE</span>
            <button className="icon-button subtle" aria-label="More options" onClick={() => notify('You’re all caught up')}><MoreHorizontal size={20} /></button>
          </div>
          <div className="sidebar-heading">
            <div>
              <h1>{activeTab === 'Chats' ? 'Messages' : activeTab}</h1>
              <p>{activeTab === 'Chats' ? 'Good conversations live here.' : 'Your people, all in one place.'}</p>
            </div>
            <button className="round-button compose" aria-label="New conversation" onClick={() => { setContactSearch(''); setShowNewChat(true) }}><Plus size={20} /></button>
          </div>
          {activeTab === 'Chats' && (
            <>
              <label className="search-field">
                <Search size={17} />
                <input ref={searchInput} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search anything" />
                <kbd>⌘ K</kbd>
              </label>
              <div className="filter-row">
                {(['All', 'Unread', 'Groups'] as const).map((filter) => (
                  <button key={filter} className={`filter-chip ${chatFilter === filter ? 'active' : ''}`}
                    onClick={() => setChatFilter(filter)}>{filter}{filter === 'Unread' && <span>{chats.filter((chat) => chat.unread > 0).length}</span>}</button>
                ))}
                <button className="icon-button filter-more" aria-label="More filters" onClick={() => notify('All conversations are shown')}><ListFilter size={17} /></button>
              </div>
              <div className="list-label"><span>PINNED</span><span className="label-line" /></div>
              <div className="chat-list">
                {visibleChats.filter((chat) => chat.pinned).map((chat) => (
                  <ChatRow key={chat.id} chat={chat} active={chat.id === activeId} onClick={() => selectChat(chat.id)} />
                ))}
              </div>
              <div className="list-label recent-label"><span>ALL MESSAGES</span><span className="label-line" /><button onClick={() => notify('Showing all conversations')}>See all</button></div>
              <div className="chat-list lower-list">
                {visibleChats.filter((chat) => !chat.pinned).map((chat) => (
                  <ChatRow key={chat.id} chat={chat} active={chat.id === activeId} onClick={() => selectChat(chat.id)} />
                ))}
                {!visibleChats.length && <div className="empty-search"><Search size={19} /><span>No conversations found</span></div>}
              </div>
              <div className="sidebar-footer"><span className="secure-dot" /> Sample conversations <MessageCircle size={13} /></div>
            </>
          )}
          {activeTab !== 'Chats' && <SectionList tab={activeTab} user={user} themePref={themePref} onToggleTheme={onToggleTheme} onLogout={onLogout} onSelect={(message) => notify(message)} />}
        </section>

        <section className="conversation glass">
          <header className="chat-header">
            {activeChat ? (
              <>
                <div className="chat-person" role="button" tabIndex={0} onClick={() => setShowDetails(true)}
                  onKeyDown={(event) => event.key === 'Enter' && setShowDetails(true)}>
                  <Avatar initials={activeChat.initials} color={activeChat.color} online={activeChat.online} />
                  <div><h2>{activeChat.name}</h2><p>{activeChat.online ? <><span className="presence-dot" /> Active now</> : activeChat.group ? '6 members · 3 active' : 'Last seen today'}</p></div>
                </div>
                <div className="header-actions">
                  <button className="icon-button" aria-label="Start voice call" onClick={() => openCall('voice')}><Phone size={19} /></button>
                  <button className="icon-button" aria-label="Start video call" onClick={() => openCall('video')}><Video size={20} /></button>
                  <span className="action-divider" />
                  <button className="icon-button" aria-label="Conversation details" onClick={() => setShowDetails(!showDetails)}><Info size={19} /></button>
                  <button className="icon-button mobile-back" aria-label="Back to conversations" onClick={() => setMobileChatOpen(false)}><ArrowLeft size={20} /></button>
                </div>
              </>
            ) : <div className="chat-person"><h2>Choose a conversation</h2></div>}
          </header>
          <div className="date-pill"><LockKeyhole size={12} /> YOUR PRIVATE SPACE <span>·</span> TODAY</div>
          <div className="message-scroll">
            <div className="message-context"><span className={`context-avatar avatar-${activeChat?.color ?? 'coral'}`}>{activeChat?.initials ?? 'V'}</span>
              <span>This is the beginning of your conversation with <b>{activeChat?.name}</b>.</span></div>
            {activeChat?.messages.map((message, index) => {
              const previous = activeChat.messages[index - 1]
              const next = activeChat.messages[index + 1]
              const startsGroup = !previous || previous.mine !== message.mine
              const endsGroup = !next || next.mine !== message.mine
              return (
              <div key={message.id} className={`message-line ${message.mine ? 'mine' : ''} ${endsGroup ? 'group-end' : ''}`}>
                {!message.mine && (endsGroup
                  ? <Avatar initials={activeChat.initials} color={activeChat.color} size="small" />
                  : <span className="avatar-spacer" />)}
                <div className="message-column">
                  {startsGroup && !message.mine && <span className="message-author">{activeChat.name.split(' ')[0]}</span>}
                  <div className={`message-bubble ${message.mine ? 'sent' : 'received'}`}>
                    {message.reply && <div className="reply-quote">{message.reply}</div>}
                    <span>{message.text}</span>
                    <span className="message-time">{message.time}{message.mine && <CheckCheck size={13} />}</span>
                    {message.reaction && <span className="reaction-pill">{message.reaction} <small>1</small></span>}
                  </div>
                  {!message.mine && <div className="message-tools">
                    <button aria-label="Reply to message" onClick={() => setReplyTo(message)}><MessageCircle size={14} /></button>
                    <button aria-label="React to message" onClick={() => setChats((current) => current.map((chat) => chat.id === activeId
                      ? { ...chat, messages: chat.messages.map((item) => item.id === message.id ? { ...item, reaction: item.reaction ? undefined : '💛' } : item) }
                      : chat))}><Smile size={14} /></button>
                    <button aria-label="More message actions" onClick={() => notify('Message options: reply, react, or save')}><MoreHorizontal size={15} /></button>
                  </div>}
                </div>
              </div>
              )
            })}
            {activeChat?.online && <div className="typing-indicator"><Avatar initials={activeChat.initials} color={activeChat.color} size="small" />
              <div className="typing-bubble"><i /><i /><i /></div><span>{activeChat.name.split(' ')[0]} is here</span></div>}
            <div ref={messagesEnd} />
          </div>
          <div className="composer-wrap">
            {replyTo && <div className="reply-bar"><div><span>REPLYING TO {activeChat?.name.split(' ')[0].toUpperCase()}</span><p>{replyTo.text}</p></div><button aria-label="Cancel reply" onClick={() => setReplyTo(null)}><X size={16} /></button></div>}
            <div className="composer">
              <button className="icon-button composer-attach" aria-label="Attach a file" onClick={() => document.getElementById('file-input')?.click()}><Paperclip size={19} /></button>
              <input id="file-input" className="visually-hidden" type="file" accept="image/*,.pdf,.doc,.docx,.txt" onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) sendMessage(`📎 ${file.name} (local attachment preview)`)
                event.target.value = ''
              }} />
              <div className="composer-input"><input value={draft} onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => event.key === 'Enter' && !event.shiftKey && (event.preventDefault(), sendMessage())}
                placeholder="Write something lovely..." aria-label="Write a message" />
                <button className="emoji-button" aria-label="Choose emoji" onClick={() => setShowEmoji(!showEmoji)}><Smile size={18} /></button>
              </div>
              {showEmoji && <div className="emoji-picker">{['😊', '💛', '✨', '😂', '🥹', '🌿', '🙌', '❤️'].map((emoji) =>
                <button key={emoji} onClick={() => setDraft((current) => `${current}${emoji}`)}>{emoji}</button>)}</div>}
              <button className={`send-button ${draft.trim() ? 'ready' : ''}`} aria-label={draft.trim() ? 'Send message' : 'Record voice message'}
                onClick={() => draft.trim() ? sendMessage() : sendMessage('🎙 Voice message · 0:03 (demo)')}>
                {draft.trim() ? <Send size={17} /> : <Mic size={18} />}
              </button>
            </div>
            <div className="composer-hint">Press <kbd>Enter</kbd> to add a message <span>·</span> Sample workspace, not delivered to contacts</div>
          </div>
        </section>

        {showDetails && activeChat && <aside className="details-panel glass">
          <div className="details-head"><span>DETAILS</span><button className="icon-button" aria-label="Close details" onClick={() => setShowDetails(false)}><X size={18} /></button></div>
          <div className="details-profile"><Avatar initials={activeChat.initials} color={activeChat.color} size="large" online={activeChat.online} />
            <h2>{activeChat.name}</h2><p>{activeChat.online ? 'Active now' : 'VYBE member'}</p><button className="detail-action" onClick={() => notify('Profile details are stored on this device')}><AtSign size={15} /> View profile</button>
          </div>
          <div className="details-section"><span>SHARED SPACE</span>
            <button onClick={() => notify('Shared media will appear here as you chat')}><Image size={17} /> Media & links <ChevronRight size={16} /></button>
            <button onClick={() => notify('No saved messages yet')}><Bookmark size={17} /> Saved messages <ChevronRight size={16} /></button>
            <button onClick={() => notify('No shared notes yet')}><CalendarDays size={17} /> Shared notes <ChevronRight size={16} /></button>
          </div>
          <button className="privacy-note" onClick={() => notify('Accounts use the server. Sample conversations are not yet sent between users.')}><Info size={16} /><span><b>About conversations</b><small>Sample messages are not delivered.</small></span><ChevronRight size={15} /></button>
        </aside>}
      </div>

      {showNewChat && <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setShowNewChat(false)}>
        <section className="new-chat glass" role="dialog" aria-modal="true" aria-labelledby="new-chat-title">
          <div className="modal-head"><div><span className="eyebrow">MAKE A CONNECTION</span><h2 id="new-chat-title">New message</h2></div><button className="icon-button" aria-label="Close" onClick={() => setShowNewChat(false)}><X size={19} /></button></div>
          <label className="search-field modal-search"><Search size={17} /><input ref={contactSearchInput} value={contactSearch} placeholder="Find someone by name" onChange={(event) => setContactSearch(event.target.value)} /><kbd>⌘ K</kbd></label>
          <div className="contact-label">SUGGESTED PEOPLE <span className="secure-dot" /></div>
          {people.filter((person) => person.name.toLowerCase().includes(contactSearch.toLowerCase())).map((person) => (
            <button key={person.name} className="contact-row" onClick={() => startChat(person)}>
              <Avatar initials={person.initials} color={person.color} online /><span><b>{person.name}</b><small>On VYBE · Active now</small></span><ChevronRight size={17} />
            </button>
          ))}
          <button className="invite-button" onClick={() => notify('Invite links are unavailable in this offline demo')}><Plus size={17} /> Invite someone new</button>
        </section>
      </div>}

      {call && <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setCall(null)}>
        <section className="call-card glass" role="dialog" aria-modal="true">
          <button className="icon-button call-close" aria-label="Close call panel" onClick={() => setCall(null)}><X size={19} /></button>
          <div className={`call-orbit avatar-${activeChat?.color ?? 'coral'}`}><Avatar initials={activeChat?.initials ?? 'V'} color={activeChat?.color ?? 'coral'} size="large" /></div>
          <span className="eyebrow">{call === 'video' ? 'VIDEO CALL' : 'VOICE CALL'}</span>
          <h2>{activeChat?.name}</h2><p>Calls aren’t connected in this preview.</p>
          <button className="end-call" onClick={() => setCall(null)}><Phone size={18} /> Got it</button>
        </section>
      </div>}

      {toast && <div className="toast"><Check size={15} /> {toast}</div>}
      <div className="mobile-tabs glass">
        {navItems.map(({ id, icon: Icon }) => <button key={id} className={activeTab === id ? 'active' : ''}
          aria-label={id} onClick={() => { setActiveTab(id); setMobileChatOpen(false) }}><Icon size={19} /><span>{id}</span></button>)}
      </div>
      <button className="theme-toggle" aria-label={`Appearance: ${themePref}. Tap to change`} title="Change appearance" onClick={onToggleTheme}>
        {themePref === 'dark' ? <Sparkles size={16} /> : themePref === 'light' ? <Zap size={16} /> : <ChevronDown size={16} />}
      </button>
      <div className="theme-label">{themePref.toUpperCase()}</div>
    </main>
  )
}

function ChatRow({ chat, active, onClick }: { chat: Chat; active: boolean; onClick: () => void }) {
  return (
    <button className={`chat-row ${active ? 'active' : ''}`} onClick={onClick}>
      <Avatar initials={chat.initials} color={chat.color} online={chat.online} />
      <span className="chat-row-body"><span className="chat-row-name">{chat.name}{chat.group && <span className="group-mark"><Hash size={11} /></span>}</span>
        <span className="chat-preview">{chat.preview}</span></span>
      <span className="chat-row-meta"><span>{chat.time}</span>{chat.unread > 0 && <b>{chat.unread}</b>}</span>
    </button>
  )
}

function SectionList({ tab, onSelect, themePref, onToggleTheme, user, onLogout }: {
  tab: string
  onSelect: (message: string) => void
  themePref: 'system' | 'light' | 'dark'
  onToggleTheme: () => void
  user: Account
  onLogout: () => void
}) {
  const [activeFilter, setActiveFilter] = useState('All')
  const callHistory = [
    ['MC', 'Maya Chen', 'Today, 10:42 AM', 'video', 'coral'],
    ['NW', 'Noah Williams', 'Yesterday, 8:16 PM', 'voice', 'blue'],
    ['EP', 'Ellie Park', 'Yesterday, 2:30 PM', 'missed', 'pink'],
    ['TW', 'The Weekenders', 'Monday, 6:05 PM', 'voice', 'violet'],
  ]
  if (tab === 'Calls') return (
    <div className="section-content">
      <div className="section-chips">{['All', 'Missed'].map((filter) => <button key={filter}
        className={activeFilter === filter ? 'active' : ''} onClick={() => setActiveFilter(filter)}>{filter}</button>)}</div>
      {callHistory.filter(([, , , type]) => activeFilter === 'All' || type === 'missed').map(([initials, name, time, type, color]) => <button className="activity-row" key={name} onClick={() => onSelect('Calling isn’t available in this preview')}>
        <Avatar initials={initials} color={color} /><span><b>{name}</b><small>{time}</small></span>
        {type === 'video' ? <Video size={17} /> : type === 'missed' ? <Phone size={17} className="missed-call" /> : <Phone size={17} />}
      </button>)}
      <div className="section-footnote"><Phone size={14} /> Calls are shown as an on-device preview</div>
    </div>
  )
  if (tab === 'Communities') return (
    <div className="section-content">
      <div className="community-feature"><div className="community-icon"><Hash size={22} /></div><div><span>YOUR CIRCLES</span><h3>Better together.</h3><p>Find your people around the things you love.</p></div></div>
      {[
        ['AP', 'Design & Daydreams', '8 channels · 24 members', 'green'],
        ['TW', 'The Weekenders', '2 channels · 6 members', 'violet'],
        ['SL', 'Sunday Lunch Club', '1 channel · 8 members', 'gold'],
      ].map(([initials, name, description, color]) => <button className="activity-row" key={name} onClick={() => onSelect(`${name} community details are coming soon`)}>
        <Avatar initials={initials} color={color} /><span><b>{name}</b><small>{description}</small></span><ChevronRight size={17} />
      </button>)}
      <button className="outline-action" onClick={() => onSelect('Community creation is coming soon')}><Plus size={16} /> Create a community</button>
    </div>
  )
  if (tab === 'Updates') return (
    <div className="section-content">
      <div className="updates-heading"><span>YOUR PEOPLE, LATELY</span><button onClick={() => onSelect('Story creation is coming soon')}><Plus size={15} /> Add story</button></div>
      <div className="story-grid">
        {[['JD', 'Your story', 'lavender'], ['MC', 'Maya Chen', 'coral'], ['NW', 'Noah W.', 'blue'], ['EP', 'Ellie Park', 'pink'], ['AP', 'Ari Patel', 'green']].map(([initials, name, color], index) =>
          <button key={name} className="story-item" onClick={() => onSelect(index === 0 ? 'Story creation is coming soon' : `${name}’s updates aren’t available in this preview`)}>
            <span className={`story-ring ${index === 0 ? 'own-story' : ''}`}><Avatar initials={initials} color={color} size="large" /></span><small>{name}</small>
          </button>)}
      </div>
      <div className="update-empty"><div className="sparkle-mark">✦</div><h3>A little life lately</h3><p>Moments from your people will show up here.</p></div>
    </div>
  )
  return (
    <div className="section-content profile-section">
      <div className="profile-cover"><span className="cover-orb" /><button aria-label="Edit profile accent" onClick={() => onSelect('Profile accent customization is coming soon')}><Settings2 size={16} /></button></div>
      <div className="profile-info"><Avatar initials={initialsOf(user.name)} color="lavender" size="large" /><h2>{user.name}</h2><p>@{user.username}</p><span>{user.email}</span></div>
      <button className="settings-row" onClick={onToggleTheme}>
        <span className="setting-icon">{themePref === 'dark' ? <Sparkles size={17} /> : themePref === 'light' ? <Zap size={17} /> : <Settings2 size={17} />}</span>
        <span><b>Appearance</b><small>{themePref === 'system' ? 'Following your device' : themePref === 'dark' ? 'Dark' : 'Light'}</small></span>
        <span className="theme-badge">{themePref === 'system' ? 'Auto' : themePref === 'dark' ? 'Dark' : 'Light'}</span>
      </button>
      {[
        [Bell, 'Notifications', 'Make it your kind of quiet'],
        [LockKeyhole, 'Privacy & security', 'Your space, your rules'],
        [Archive, 'Storage & data', 'All tidy on this device'],
        [Sparkles, 'VYBE Plus', 'A little more of what you love'],
      ].map(([Icon, title, caption]) => <button className="settings-row" key={title as string} onClick={() => onSelect(`${title as string} settings are coming soon`)}>
        <span className="setting-icon"><Icon size={17} /></span><span><b>{title as string}</b><small>{caption as string}</small></span><ChevronRight size={16} />
      </button>)}
      <button className="settings-row logout-row" onClick={onLogout}>
        <span className="setting-icon logout-icon"><LogOut size={17} /></span><span><b>Log out</b><small>Sign out of this device</small></span>
      </button>
    </div>
  )
}
