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
    const { game_id, bid } = await req.json()
    if (game_id === undefined || bid === undefined) return NextResponse.json({ error: 'game_id and bid required' }, { status: 400 })
    if (![0,1,2,3].includes(bid)) return NextResponse.json({ error: 'bid must be 0-3' }, { status: 400 })

    const user = await getAuthUser(req)
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    // Get game + member
    const { data: session } = await supabaseAdmin.from('game_sessions').select('*').eq('id', game_id).single()
    if (!session) return NextResponse.json({ error: 'game not found' }, { status: 404 })
    if (session.status !== 'bidding') return NextResponse.json({ error: 'not in bidding phase' }, { status: 400 })

    const { data: member } = await supabaseAdmin
      .from('room_members').select('pvp_slot').eq('room_id', session.room_id).eq('user_id', user.id).single()
    if (!member) return NextResponse.json({ error: 'not in game' }, { status: 403 })

    const slot = member.pvp_slot as number
    if (session.current_player_slot !== slot) return NextResponse.json({ error: 'not your turn' }, { status: 400 })

    // Record bid
    await supabaseAdmin.from('game_bids').upsert({ game_id, player_slot: slot, bid_value: bid })
    await supabaseAdmin.from('game_moves').insert({ game_id, player_slot: slot, move_type: 'bid', bid_value: bid })

    // Check all bids
    const { data: allBids } = await supabaseAdmin.from('game_bids').select('*').eq('game_id', game_id)
    const nextSlot = (slot + 1) % 3

    // If all 3 have bid
    if (allBids && allBids.filter(b => b.bid_value !== null).length === 3) {
      const maxBid = Math.max(...allBids.map(b => (b.bid_value as number | null) ?? 0))

      if (maxBid === 0) {
        // Everyone bid 0 → restart (reset bids, start from slot 0 again)
        await supabaseAdmin.from('game_bids').update({ bid_value: null }).eq('game_id', game_id)
        await supabaseAdmin.from('game_sessions').update({
          current_player_slot: 0,
          last_action_at: new Date().toISOString(),
        }).eq('id', game_id)
        return NextResponse.json({ status: 'rebid', message: 'all passed, rebid from slot 0' })
      }

      // Find winner: highest bid; tie → last to bid wins (highest slot that bid max)
      const winnerBid = allBids
        .filter(b => b.bid_value === maxBid)
        .sort((a, b) => (b.player_slot as number) - (a.player_slot as number))[0]
      const landlordSlot = winnerBid.player_slot as number

      // Give landlord cards
      const { data: hand } = await supabaseAdmin.from('game_hands').select('cards').eq('game_id', game_id).eq('player_slot', landlordSlot).single()
      const newHand = [...((hand?.cards as unknown[]) ?? []), ...((session.landlord_cards as unknown[]) ?? [])]
      await supabaseAdmin.from('game_hands').update({ cards: newHand }).eq('game_id', game_id).eq('player_slot', landlordSlot)

      // Update session → playing
      await supabaseAdmin.from('game_sessions').update({
        status: 'playing',
        landlord_slot: landlordSlot,
        current_player_slot: landlordSlot,
        base_bid: maxBid,
        multiplier: maxBid,
        last_action_at: new Date().toISOString(),
      }).eq('id', game_id)

      const { data: myHand } = await supabaseAdmin.from('game_hands').select('cards').eq('game_id', game_id).eq('player_slot', slot).single()
      return NextResponse.json({
        status: 'playing',
        landlordSlot,
        landlordCards: session.landlord_cards,
        multiplier: maxBid,
        myHand: (myHand?.cards as unknown[]) ?? [],
      })
    }

    // Advance to next player
    await supabaseAdmin.from('game_sessions').update({
      current_player_slot: nextSlot,
      last_action_at: new Date().toISOString(),
    }).eq('id', game_id)

    return NextResponse.json({ status: 'bid_recorded', nextSlot })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'internal error' }, { status: 500 })
  }
}
