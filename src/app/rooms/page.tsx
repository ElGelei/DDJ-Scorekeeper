import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import CreateRoomButton from '@/components/CreateRoomButton'
import RoomActions from '@/components/RoomActions'

export const dynamic = 'force-dynamic'

export default async function RoomsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: userRooms } = await supabase
    .from('room_members')
    .select('room_id, player_slot, joined_at, rooms(id, name, code, created_by, created_at)')
    .eq('user_id', user.id)
    .order('joined_at', { ascending: false })

  const rooms = (userRooms ?? [])
    .map((r: any) => ({ ...r.rooms, player_slot: r.player_slot }))
    .filter(Boolean)

  const hosted = rooms.filter((r: any) => r.created_by === user.id)
  const joined = rooms.filter((r: any) => r.created_by !== user.id)

  return (
    <main className="min-h-screen bg-[#1A0A00] text-[#F5ECD7] px-5 pt-6 pb-20"
      style={{
        backgroundImage: 'radial-gradient(ellipse at 20% 20%, rgba(139,0,0,0.2) 0%, transparent 50%)'
      }}
    >
      <Link href="/dashboard" className="text-[#C9A84C]/60 hover:text-[#C9A84C] text-xs font-display tracking-wider transition-colors">
        ← Dashboard
      </Link>

      <div className="flex items-center justify-between mt-4 mb-8">
        <h1 className="font-display text-[#C9A84C] text-xl tracking-wider">Rooms</h1>
        <CreateRoomButton userId={user.id} />
      </div>

      {rooms.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-4xl mb-3 opacity-30">🃏</div>
          <p className="text-[#F5ECD7]/30 text-sm font-body italic">No rooms yet. Create one to start playing.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-8">

          {/* Hosted rooms */}
          {hosted.length > 0 && (
            <div>
              <div className="flex items-center gap-3 mb-3">
                <span className="font-display text-[#C9A84C]/50 text-xs tracking-widest uppercase">Your Rooms</span>
                <div className="flex-1 h-px bg-[#C9A84C]/10" />
                <span className="text-[#C9A84C]/30 text-xs">👑 {hosted.length}</span>
              </div>
              <div className="flex flex-col gap-2">
                {hosted.map((room: any) => (
                  <div key={room.id} className="flex items-center gap-2">
                    <Link
                      href={`/rooms/${room.id}`}
                      className="flex-1 flex items-center justify-between px-4 py-4 bg-[#F5ECD7]/4 border border-[#C9A84C]/25 rounded-xl hover:border-[#C9A84C]/50 transition-all"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[#C9A84C]/50 text-xs">👑</span>
                          <span className="text-[#E8C97A] font-display text-sm tracking-wider">{room.name}</span>
                        </div>
                        <div className="text-[#F5ECD7]/25 text-xs font-body mt-0.5 ml-5">Code: {room.code}</div>
                      </div>
                      <span className="text-[#C9A84C]/40 text-lg">›</span>
                    </Link>
                    <RoomActions roomId={room.id} roomName={room.name} isHost={true} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Joined rooms */}
          {joined.length > 0 && (
            <div>
              <div className="flex items-center gap-3 mb-3">
                <span className="font-display text-[#C9A84C]/50 text-xs tracking-widest uppercase">Joined Rooms</span>
                <div className="flex-1 h-px bg-[#C9A84C]/10" />
                <span className="text-[#F5ECD7]/20 text-xs">🎴 {joined.length}</span>
              </div>
              <div className="flex flex-col gap-2">
                {joined.map((room: any) => (
                  <div key={room.id} className="flex items-center gap-2">
                    <Link
                      href={`/rooms/${room.id}`}
                      className="flex-1 flex items-center justify-between px-4 py-4 bg-[#F5ECD7]/3 border border-[#F5ECD7]/10 rounded-xl hover:border-[#F5ECD7]/20 transition-all"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[#F5ECD7]/20 text-xs">🎴</span>
                          <span className="text-[#F5ECD7]/80 font-display text-sm tracking-wider">{room.name}</span>
                        </div>
                        <div className="text-[#F5ECD7]/20 text-xs font-body mt-0.5 ml-5">Slot {room.player_slot} · Code: {room.code}</div>
                      </div>
                      <span className="text-[#F5ECD7]/20 text-lg">›</span>
                    </Link>
                    <RoomActions roomId={room.id} roomName={room.name} isHost={false} />
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      )}
    </main>
  )
}
