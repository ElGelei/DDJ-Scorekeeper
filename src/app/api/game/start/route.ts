import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createDeck, shuffle, deal } from '@/lib/ddz/engine'

// Use service role to bypass RLS for server-side writes
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { room_id } = await req.json()
    if (!room_id) return NextResponse.json({ error: 'room_id required' }, { status: 400 })

    // Get auth user
    const authHeader = req.headers.get('authorization')
    if (!authHeader) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
    if (authError || !user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    // Get room members with pvp_slots
    const { data: members, error: membersError } = await supabaseAdmin
      .from('room_members')
      .select('user_id, pvp_slot, is_ready')
      .eq('room_id', room_id)
      .order('pvp_slot')

    if (membersError || !members) return NextResponse.json({ error: 'room not found' }, { status: 404 })
    if (members.length !== 3) return NextResponse.json({ error: 'need exactly 3 players' }, { status: 400 })

    const notReady = members.filter(m => !m.is_ready)
    if (notReady.length > 0) return NextResponse.json({ error: 'not all players ready' }, { status: 400 })

    // Find calling user's slot
    const myMember = members.find(m => m.user_id === user.id)
    if (!myMember) return NextResponse.json({ error: 'not in room' }, { status: 403 })

    // Deal cards
    const deck = shuffle(createDeck())
    const { hands, landlordCards } = deal(deck)

    // Create game session
    const { data: session, error: sessionError } = await supabaseAdmin
      .from('game_sessions')
      .insert({
        room_id,
        status: 'bidding',
        current_player_slot: 0,
        landlord_cards: landlordCards,
        multiplier: 1,
        base_bid: 0,
        last_action_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (sessionError || !session) return NextResponse.json({ error: 'failed to create session' }, { status: 500 })

    // Write hands (server-side only — bypasses RLS via service role)
    const handRows = members.map((m, i) => ({
      game_id: session.id,
      player_slot: m.pvp_slot ?? i,
      cards: hands[m.pvp_slot ?? i],
    }))
    const { error: handsError } = await supabaseAdmin.from('game_hands').insert(handRows)
    if (handsError) return NextResponse.json({ error: 'failed to write hands' }, { status: 500 })

    // Init bids
    const bidRows = members.map((m, i) => ({
      game_id: session.id,
      player_slot: m.pvp_slot ?? i,
      bid_value: null,
    }))
    await supabaseAdmin.from('game_bids').insert(bidRows)

    // Return public state + calling player's hand
    const mySlot = myMember.pvp_slot ?? 0
    return NextResponse.json({
      public: {
        gameId: session.id,
        roomId: room_id,
        status: 'bidding',
        currentPlayerSlot: 0,
        landlordSlot: null,
        landlordCards: null,
        multiplier: 1,
        baseBid: 0,
        bids: [null, null, null],
        cardCounts: [17, 17, 17],
        lastMove: null,
        lastActionAt: session.last_action_at,
      },
      private: {
        hand: hands[mySlot],
        slot: mySlot,
      },
    })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'internal error' }, { status: 500 })
  }
}
