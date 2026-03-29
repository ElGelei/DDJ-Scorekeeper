import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import CreateRoomButton from '@/components/CreateRoomButton'

export default async function RoomsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: userRooms } = await supabase
    .from('room_members')
    .select('room_id, player_slot, rooms(id, name, code, created_at)')
    .eq('user_id', user.id)
    .order('joined_at', { ascending: false })

  const rooms = (userRooms ?? []).map((r: any) => r.rooms).filter(Boolean)

  return (
    <main className="min-h-screen bg-[#1A0A00] text-[#F5ECD7] px-5 pt-6 pb-20"
      style={{
        backgroundImage: 'radial-gradient(ellipse at 20% 20%, rgba(139,0,0,0.2) 0%, transparent 50%)'
      }}
    >
      <Link href="/dashboard" className="text-[#C9A84C]/60 hover:text-[#C9A84C] text-xs font-display tracking-wider transition-colors">
        ← Dashboard
      </Link>

      <div className="flex items-center justify-between mt-4 mb-6">
        <h1 className="font-display text-[#C9A84C] text-xl tracking-wider">Rooms</h1>
        <CreateRoomButton userId={user.id} />
      </div>

      {rooms.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-4xl mb-3 opacity-30">🃏</div>
          <p className="text-[#F5ECD7]/30 text-sm font-body italic">No rooms yet. Create one to start playing.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {rooms.map((room: any) => (
            <Link
              key={room.id}
              href={`/rooms/${room.id}`}
              className="flex items-center justify-between px-4 py-4 bg-[#F5ECD7]/4 border border-[#C9A84C]/20 rounded-xl hover:border-[#C9A84C]/40 transition-all"
            >
              <div>
                <div className="text-[#E8C97A] font-display text-sm tracking-wider">{room.name}</div>
                <div className="text-[#F5ECD7]/30 text-xs font-body mt-0.5">Code: {room.code}</div>
              </div>
              <span className="text-[#C9A84C]/40 text-lg">›</span>
            </Link>
          ))}
        </div>
      )}
    </main>
  )
}
