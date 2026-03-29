import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Scorekeeper from '@/components/Scorekeeper'
import Link from 'next/link'

interface Props {
  params: { roomId: string; sessionId: string }
}

export default async function SessionPage({ params }: Props) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Load room
  const { data: room } = await supabase
    .from('rooms')
    .select('*')
    .eq('id', params.roomId)
    .single()

  if (!room) redirect('/rooms')

  // Load session
  const { data: session } = await supabase
    .from('sessions')
    .select('*')
    .eq('id', params.sessionId)
    .eq('room_id', params.roomId)
    .single()

  if (!session) redirect(`/rooms/${params.roomId}`)

  // Load room members with user profiles
  const { data: members } = await supabase
    .from('room_members')
    .select('player_slot, user_id, users(display_name)')
    .eq('room_id', params.roomId)
    .order('player_slot')

  const players = (members ?? []).map((m: any) => ({
    slot: m.player_slot,
    name: m.users?.display_name ?? `Player ${m.player_slot}`,
    userId: m.user_id,
  }))

  // Pad to 3 if needed
  while (players.length < 3) {
    players.push({ slot: players.length + 1, name: `Player ${players.length + 1}`, userId: '' })
  }

  return (
    <div>
      {/* Back nav */}
      <div className="fixed top-0 left-0 right-0 z-50 px-4 pt-safe flex items-center h-12 bg-gradient-to-b from-[#1A0A00] to-transparent pointer-events-none">
        <Link
          href={`/rooms/${params.roomId}`}
          className="pointer-events-auto text-gold/60 hover:text-gold font-display text-xs tracking-wider transition-colors"
        >
          ← {room.name}
        </Link>
      </div>
      <Scorekeeper
        roomId={params.roomId}
        sessionId={params.sessionId}
        players={players}
        currentUserId={user.id}
      />
    </div>
  )
}
