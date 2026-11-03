export type Account = { id: string; name: string; username: string; email: string }
export type Member = Pick<Account, 'id' | 'name' | 'username'>
export type Profile = Member & { about: string; photo: string; version: number }
export type StatusPost = { id: string; userId: string; text: string; color: 'violet' | 'ocean' | 'rose'; createdAt: number; expiresAt: number }
export type Message = {
  id: string; senderId: string; text: string; createdAt: string; replyId?: string
  reactions: Record<string, string>
}
export type Chat = { id: string; version: number; members: Member[]; messages: Message[]; read: Record<string, number> }
type Result = {
  user?: Account; chats?: Chat[]; chat?: Chat; error?: string
  profiles?: Profile[]; profile?: Profile; statuses?: StatusPost[]; serverTime?: number
}
export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message) }
}
export async function request(endpoint: 'auth' | 'messages', body: Record<string, string | number>): Promise<Result> {
  const response = await fetch(`/api/${endpoint}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin', cache: 'no-store', body: JSON.stringify(body),
    signal: AbortSignal.timeout(25000),
  })
  if (!response.headers.get('content-type')?.includes('application/json')) {
    throw new Error('The server is unavailable. Please try again.')
  }
  const result: Result = await response.json()
  if (!response.ok) throw new ApiError(result.error || 'Unable to complete this request.', response.status)
  return result
}
export const errorText = (error: unknown) => error instanceof Error ? error.message : 'Unable to connect. Please try again.'
export function Avatar({ name, photo }: { name: string; photo?: string }) {
  return photo
    ? <span className="avatar avatar-violet"><img src={photo} alt={`${name}'s profile`} /></span>
    : <span className="avatar avatar-violet">{name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('')}</span>
}
