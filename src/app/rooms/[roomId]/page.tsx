import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import AddPlayerButton from '@/components/AddPlayerButton'

interface Props {
  params: { roomId: string }
}

export default async function RoomPage({ params }: Props) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: room } = await supabase
    .from('rooms')
    .select('*')
    .eq('id', params.roomId)
    .single()

  if (!room) redirect('/rooms')

  const { data: members } = await supabase
    .from('room_members')
    .select('player_slot, user_id, users(display_name, player_id)')
    .eq('room_id', params.roomId)
    .order('player_slot')

  const { data: sessions } = await supabase
    .from('sessions')
    .select('id, started_at, ended_at')
    .eq('room_id', params.roomId)
    .order('started_at', { ascending: false })
    .limit(10)

  // Check active session (no ended_at)
  const activeSession = sessions?.find(s => !s.ended_at)

  return (
    <main className="min-h-screen bg-[#1A0A00] text-[#F5ECD7] px-5 pt-6 pb-20"
      style={{
        backgroundImage: 'radial-gradient(ellipse at 20% 20%, rgba(139,0,0,0.2) 0%, transparent 50%), radial-gradient(ellipse at 80% 80%, rgba(201,168,76,0.12) 0%, transparent 50%)'
      }}
    >
      <Link href="/rooms" className="text-[#C9A84C]/60 hover:text-[#C9A84C] text-xs font-display tracking-wider transition-colors">
        ← Rooms
      </Link>

      <h1 className="font-display text-[#C9A84C] text-2xl tracking-wider mt-4 mb-1">{room.name}</h1>
      <p className="text-[#F5ECD7]/30 text-xs font-body italic mb-6">Code: {room.code}</p>

      {/* Members */}
      <div className="mb-6">
        <p className="font-display text-[#C9A84C]/50 text-xs tracking-widest uppercase mb-3">
          Players ({(members ?? []).length}/3)
        </p>
        <div className="flex gap-2 flex-wrap">
          {(members ?? []).map((m: any) => (
            <div key={m.user_id} className="bg-[#F5ECD7]/5 border border-[#C9A84C]/20 rounded-lg px-3 py-2 text-center">
              <div className="text-[#E8C97A] font-display text-xs">{m.users?.display_name ?? '—'}</div>
              <div className="text-[#F5ECD7]/30 text-xs font-body">Slot {m.player_slot}</div>
            </div>
          ))}
          {/* Add player button — only visible to room creator, max 3 players */}
          {room.created_by === user.id && (members ?? []).length < 3 && (
            <AddPlayerButton
              roomId={params.roomId}
              currentUserId={user.id}
              existingMemberIds={(members ?? []).map((m: any) => m.user_id)}
              currentMemberCount={(members ?? []).length}
            />
          )}
        </div>
      </div>

      {/* Start / Resume session */}
      {activeSession ? (
        <Link
          href={`/rooms/${params.roomId}/session/${activeSession.id}`}
          className="w-full py-4 block text-center bg-gradient-to-r from-[#8B0000] to-[#5a0000] border border-[#C9A84C]/30 text-[#E8C97A] font-display tracking-widest rounded-lg text-sm uppercase mb-3 hover:border-[#C9A84C]/60 transition-all"
        >
          👑 Resume Active Session
        </Link>
      ) : (
        <Link
          href={`/rooms/${params.roomId}/new-session`}
          className="w-full py-4 block text-center bg-gradient-to-r from-[#9A6E2A] via-[#C9A84C] to-[#9A6E2A] text-[#1A0A00] font-display font-bold tracking-widest rounded-lg text-sm uppercase mb-3 hover:opacity-90 transition-all"
        >
          ▶ Start New Session
        </Link>
      )}

      {/* Session history */}
      {sessions && sessions.length > 0 && (
        <div className="mt-6">
          <p className="font-display text-[#C9A84C]/50 text-xs tracking-widest uppercase mb-3">Session History</p>
          <div className="flex flex-col gap-2">
            {sessions.map(s => (
              <Link
                key={s.id}
                href={`/rooms/${params.roomId}/session/${s.id}`}
                className="flex items-center justify-between px-4 py-3 bg-[#F5ECD7]/3 border border-[#C9A84C]/15 rounded-lg hover:border-[#C9A84C]/30 transition-all"
              >
                <div>
                  <div className="text-[#F5ECD7]/70 text-sm font-body">
                    {new Date(s.started_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </div>
                  <div className="text-[#F5ECD7]/30 text-xs font-body italic">
                    {new Date(s.started_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
                {!s.ended_at && <span className="text-xs text-green-400 font-body italic">● live</span>}
              </Link>
            ))}
          </div>
        </div>
      )}
    </main>
  )
}
