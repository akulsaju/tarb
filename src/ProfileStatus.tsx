import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Camera, Check, CircleDot, ImagePlus, Info, Pencil, Plus, Sparkles, Trash2, X } from 'lucide-react'
import { Avatar, Profile, StatusPost, request } from './api'

async function preparePhoto(file: File): Promise<string> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Choose a JPEG, PNG or WebP photo.')
  if (file.size > 10 * 1024 * 1024) throw new Error('Choose a photo smaller than 10 MB.')
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth > 8192 || image.naturalHeight > 8192) {
      throw new Error('Choose a photo no larger than 8192 pixels on either side.')
    }
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 256
    const context = canvas.getContext('2d')
    if (!context) throw new Error('This device could not prepare the photo.')
    context.fillStyle = '#242235'
    context.fillRect(0, 0, 256, 256)
    const side = Math.min(image.naturalWidth, image.naturalHeight)
    context.drawImage(image, (image.naturalWidth - side) / 2, (image.naturalHeight - side) / 2, side, side, 0, 0, 256, 256)
    const photo = canvas.toDataURL('image/jpeg', 0.85)
    if (photo.length > 250000) throw new Error('This photo is too large after resizing. Choose another image.')
    return photo
  } finally { URL.revokeObjectURL(url) }
}

export function ProfilePanel({ profile, email, loaded, dark, onTheme, onMutate, onSaved, onError }: {
  profile: Profile; email: string; loaded: boolean; dark: boolean; onTheme: () => void
  onMutate: () => void; onSaved: (profile: Profile) => void; onError: (error: unknown) => string
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')
  const [about, setAbout] = useState('')
  const [photo, setPhoto] = useState('')
  const [version, setVersion] = useState(0)
  const [busy, setBusy] = useState(false)
  const [reading, setReading] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  function edit() {
    setName(profile.name); setAbout(profile.about); setPhoto(profile.photo); setVersion(profile.version)
    setError(''); setSaved(false); setEditing(true)
  }
  async function choose(file?: File) {
    if (!file) return
    setReading(true); setError('')
    try { setPhoto(await preparePhoto(file)) }
    catch (error) { setError(onError(error)) }
    finally { setReading(false) }
  }
  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (busy || reading) return
    setBusy(true); setError(''); onMutate()
    try {
      const result = await request('messages', { action: 'profile-save', name, about, photo, version })
      if (!result.profile) throw new Error('The server did not confirm your profile. Please retry.')
      onSaved(result.profile); setEditing(false); setSaved(true)
      panel.current?.scrollTo({ top: 0 })
    } catch (error) { setError(onError(error)) }
    finally { setBusy(false) }
  }
  return <div className="feature-content profile-section" ref={panel}>
    <div className="profile-banner"><span>YOUR VYBE</span><Camera size={24} /></div>
    <div className="profile-info"><Avatar name={profile.name} photo={profile.photo} /><h2>{profile.name}</h2><p>@{profile.username}</p></div>
    {saved && <p className="saved-note" role="status"><Check size={16} /> Profile saved to the server</p>}
    {!editing ? <>
      <button className="outline-action" disabled={!loaded} onClick={edit}><Pencil size={16} /> Edit profile & photo</button>
      <section className="profile-group"><h3>ABOUT YOU</h3><small>Profile status</small><p className="about-text">{profile.about || 'Tell your people what you’re up to.'}</p></section>
      <section className="profile-group"><h3>ACCOUNT</h3><small>Email · used to find you</small><p className="account-email">{email}</p><small>Display handle (not unique)</small><p>@{profile.username}</p></section>
    </> : <form className="profile-editor" onSubmit={save}>
      <fieldset disabled={busy || reading}>
        <legend>Edit profile</legend>
        <div className="photo-preview"><Avatar name={name || profile.name} photo={photo} /></div>
        <input ref={fileInput} className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" aria-label="Choose profile photo"
          onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ''; void choose(file) }} />
        <div className="photo-actions"><button type="button" className="outline-action" onClick={() => fileInput.current?.click()}><ImagePlus size={16} /> Change photo</button>
          {photo && <button type="button" className="text-action" onClick={() => setPhoto('')}><Trash2 size={15} /> Remove photo</button>}</div>
        <p className="field-hint">JPEG, PNG or WebP · up to 10 MB. Center-cropped to a square.</p>
        <label>Display name<input aria-label="Display name" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={80} /></label>
        <label>Profile status<textarea aria-label="Profile status" value={about} onChange={(e) => setAbout(e.target.value)} maxLength={140} rows={3} placeholder="Available, busy, or something more you…" /></label>
        <span className="field-hint">{about.length}/140</span>
        <div className="status-presets">{['Available', 'Busy', 'At work', 'Taking a break'].map((value) => <button type="button" key={value} onClick={() => setAbout(value)}>{value}</button>)}</div>
      </fieldset>
      {error && <p className="service-error" role="alert">{error}</p>}
      <div className="editor-actions"><button type="button" className="text-action" disabled={busy || reading} onClick={() => { setEditing(false); setError('') }}>Cancel</button>
        <button className="auth-submit" disabled={busy || reading}>{reading ? 'Preparing photo…' : busy ? 'Saving…' : 'Save profile'}</button></div>
    </form>}
    <section className="profile-group"><h3>PREFERENCES</h3><button className="settings-row" onClick={onTheme}><Sparkles size={18} /><span><b>Appearance</b><small>{dark ? 'Dark' : 'Light'} · Tap to change</small></span></button></section>
    <section className="profile-group"><h3>PRIVACY & DATA</h3><div className="account-note"><Info size={18} /><p>Your profile and status posts are visible to your conversation contacts. Messages and photos are stored on our server, not end-to-end encrypted. Message attachments, calls and push notifications are not available.</p></div></section>
  </div>
}

export function StatusPanel({ userId, dark, profiles, posts, now, onError, onMutate, onChanged }: {
  userId: string; dark: boolean; profiles: Profile[]; posts: StatusPost[]; now: number
  onError: (error: unknown) => string; onMutate: () => void; onChanged: (posts: StatusPost[]) => void
}) {
  const [composing, setComposing] = useState(false)
  const [text, setText] = useState('')
  const [color, setColor] = useState<StatusPost['color']>('violet')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const pending = useRef<{ id: string; text: string; color: string } | null>(null)
  const own = profiles.find((profile) => profile.id === userId)!
  const author = (id: string) => profiles.find((profile) => profile.id === id)
  const viewing = posts.find((post) => post.id === selected)
  const ownPosts = posts.filter((post) => post.userId === userId)
  const contactPosts = posts.filter((post) => post.userId !== userId).sort((a, b) => b.createdAt - a.createdAt)
  async function publish(event: React.FormEvent) {
    event.preventDefault()
    if (busy || !text.trim()) return
    const value = text.trim()
    const postId = pending.current?.text === value && pending.current.color === color ? pending.current.id : crypto.randomUUID()
    pending.current = { id: postId, text: value, color }
    setBusy(true); setError(''); onMutate()
    try {
      const result = await request('messages', { action: 'status-post', postId, text: value, color })
      if (!result.statuses) throw new Error('The server did not confirm the post. Please retry.')
      onChanged(result.statuses); setComposing(false); setText(''); pending.current = null
    } catch (error) { setError(onError(error)) }
    finally { setBusy(false) }
  }
  async function remove() {
    if (!viewing || busy) return
    setBusy(true); setError(''); onMutate()
    try {
      const result = await request('messages', { action: 'status-delete', postId: viewing.id })
      if (!result.statuses) throw new Error('Deletion was not confirmed. Please retry.')
      onChanged(result.statuses); setSelected(null); setConfirmDelete(false)
    } catch (error) { setError(onError(error)) }
    finally { setBusy(false) }
  }
  function open(id: string) { setSelected(id); setConfirmDelete(false); setError('') }
  return <div className="feature-content">
    <button className="status-create" onClick={() => { setComposing(true); setError('') }}><span className="status-avatar"><Avatar name={own.name} photo={own.photo} /><i><Plus size={13} /></i></span>
      <span><b>My status</b><small>Share a 24-hour text update</small></span><Pencil size={18} /></button>
    <div className="status-audience"><Info size={15} /> Visible to your conversation contacts. Text posts only, up to 10 active posts.</div>
    {ownPosts.length > 0 && <section className="profile-group"><h3>MY UPDATES · {ownPosts.length}</h3>{ownPosts.map((post) =>
      <button key={post.id} className="status-list-row" onClick={() => open(post.id)}><span className={`status-swatch status-${post.color}`}><CircleDot size={20} /></span><span><b>{post.text}</b><small>{Math.max(1, Math.ceil((post.expiresAt - now) / 3600000))}h left</small></span></button>)}</section>}
    <section className="profile-group"><h3>CONTACT UPDATES</h3>
      {contactPosts.map((post) => {
        const person = author(post.userId)
        if (!person) return null
        return <button key={post.id} className="status-list-row" onClick={() => open(post.id)}><span className="status-ring"><Avatar name={person.name} photo={person.photo} /></span><span><b>{person.name}</b><small>{post.text}</small></span></button>
      })}
      {!contactPosts.length && <div className="real-empty"><CircleDot size={28} /><h3>No recent updates</h3><p>Your contacts’ 24-hour posts will appear here.</p></div>}
    </section>
    {selected && !viewing && <p className="field-hint" role="status">This post has expired or was deleted.<button className="text-action" onClick={() => setSelected(null)}>Dismiss</button></p>}
    {composing && createPortal(<div className={`feature-overlay ${dark ? 'dark' : ''}`}><div className="modal-backdrop"><section className="new-chat glass status-compose" role="dialog" aria-modal="true" aria-labelledby="status-compose-title">
      <div className="modal-head"><h2 id="status-compose-title">Share a moment</h2><button className="icon-button" aria-label="Close status composer" disabled={busy} onClick={() => setComposing(false)}><X size={20} /></button></div>
      <form onSubmit={publish}><textarea className={`status-input status-${color}`} aria-label="Status text" placeholder="What’s on your mind?" value={text} onChange={(e) => setText(e.target.value)} maxLength={700} rows={6} required disabled={busy} />
        <div className="status-colors" aria-label="Status background">{(['violet', 'ocean', 'rose'] as const).map((value) => <button type="button" aria-label={`${value} background`} aria-pressed={color === value} disabled={busy} key={value} className={`status-${value}`} onClick={() => setColor(value)}>{color === value && <Check size={18} />}</button>)}<span>{text.length}/700</span></div>
        <p className="field-hint">Expires 24 hours after posting. Visible to your conversation contacts.</p>
        {error && <p className="service-error" role="alert">{error}</p>}
        <button className="auth-submit" disabled={busy || !text.trim()}>{busy ? 'Posting…' : 'Post status'}</button>
      </form>
    </section></div></div>, document.body)}
    {viewing && createPortal(<div className={`feature-overlay ${dark ? 'dark' : ''}`}><div className="modal-backdrop"><section className={`status-viewer status-${viewing.color}`} role="dialog" aria-modal="true" aria-labelledby="status-author">
      <header><Avatar name={author(viewing.userId)?.name || 'VYBE member'} photo={author(viewing.userId)?.photo} /><span><b id="status-author">{author(viewing.userId)?.name}</b><small>{new Date(viewing.createdAt).toLocaleString()}</small></span>
        <button className="icon-button" aria-label="Close status" disabled={busy} onClick={() => { setSelected(null); setError('') }}><X size={22} /></button></header>
      <p className="status-body">{viewing.text}</p><footer><small>{Math.max(1, Math.ceil((viewing.expiresAt - now) / 3600000))} hours remaining</small>
        {viewing.userId === userId && (!confirmDelete ? <button className="text-action" onClick={() => setConfirmDelete(true)}><Trash2 size={16} /> Delete post</button> : <div className="delete-confirm"><span>Delete this post?</span><button disabled={busy} onClick={() => void remove()}>{busy ? 'Deleting…' : 'Confirm delete'}</button><button disabled={busy} onClick={() => setConfirmDelete(false)}>Cancel</button></div>)}
      </footer>{error && <p className="service-error" role="alert">{error}</p>}
    </section></div></div>, document.body)}
  </div>
}
