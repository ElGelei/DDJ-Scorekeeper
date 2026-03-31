import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function getAuthUser(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader) return null
  const token = authHeader.replace('Bearer ', '')
  const { data: { user } } = await supabaseAdmin.auth.getUser(token)
  return user
}

export async function POST(req: NextRequest) {
  try {
    const { game_id } = await req.json()
    const user = await getAuthUser(req)
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const { data: session } = await supabaseAdmin.from('game_sessions').select('*').eq('id', game_id).single()
    if (!session || session.status !== 'playing') return NextResponse.json({ error: 'invalid game' }, { status: 400 })

    const { data: member } = await supabaseAdmin
      .from('room_members').select('pvp_slot').eq('room_id', session.room_id).eq('user_id', user.id).single()
    if (!member || session.current_player_slot !== (member.pvp_slot as number)) {
      return NextResponse.json({ error: 'not your turn' }, { status: 400 })
    }

    const slot = member.pvp_slot as number

    // Check if player can pass (cannot pass if they lead the trick)
    const { data: recentMoves } = await supabaseAdmin
      .from('game_moves')
      .select('player_slot, move_type')
      .eq('game_id', game_id)
      .order('played_at', { ascending: false })
      .limit(6)

    // If the most recent play was by this player, they can't pass (they lead)
    const lastPlay = recentMoves?.find(m => m.move_type === 'play' || m.move_type === 'pass')
    if (!lastPlay || lastPlay.player_slot === slot) {
      return NextResponse.json({ error: 'cannot pass when leading' }, { status: 400 })
    }

    await supabaseAdmin.from('game_moves').insert({ game_id, player_slot: slot, move_type: 'pass' })

    const nextSlot = (slot + 1) % 3
    await supabaseAdmin.from('game_sessions').update({
      current_player_slot: nextSlot,
      last_action_at: new Date().toISOString(),
    }).eq('id', game_id)

    return NextResponse.json({ status: 'passed', nextSlot })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'internal error' }, { status: 500 })
  }
}
