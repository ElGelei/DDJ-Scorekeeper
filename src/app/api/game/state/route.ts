import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { parseCombo, type Card } from '@/lib/ddz/engine'
import type { PublicGameState, LastMove } from '@/lib/ddz/pvp-types'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const game_id = searchParams.get('game_id')
    if (!game_id) return NextResponse.json({ error: 'game_id required' }, { status: 400 })

    const authHeader = req.headers.get('authorization')
    if (!authHeader) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    const token = authHeader.replace('Bearer ', '')
    const { data: { user } } = await supabaseAdmin.auth.getUser(token)
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const { data: session } = await supabaseAdmin.from('game_sessions').select('*').eq('id', game_id).single()
    if (!session) return NextResponse.json({ error: 'game not found' }, { status: 404 })

    const { data: member } = await supabaseAdmin
      .from('room_members').select('pvp_slot').eq('room_id', session.room_id).eq('user_id', user.id).single()
    if (!member) return NextResponse.json({ error: 'not in game' }, { status: 403 })

    const mySlot = member.pvp_slot as number

    // Get card counts (not the cards themselves)
    const { data: allHands } = await supabaseAdmin.from('game_hands').select('player_slot, cards').eq('game_id', game_id)
    const cardCounts: [number, number, number] = [0, 0, 0]
    const myHand: Card[] = []
    for (const h of allHands ?? []) {
      const slot = h.player_slot as number
      const cards = h.cards as Card[]
      cardCounts[slot] = cards.length
      if (slot === mySlot) myHand.push(...cards)
    }

    // Get bids
    const { data: bids } = await supabaseAdmin.from('game_bids').select('player_slot, bid_value').eq('game_id', game_id)
    const bidArr: (number | null)[] = [null, null, null]
    for (const b of bids ?? []) {
      bidArr[b.player_slot as number] = b.bid_value as number | null
    }

    // Get last move
    const { data: moves } = await supabaseAdmin
      .from('game_moves').select('*').eq('game_id', game_id)
      .order('played_at', { ascending: false }).limit(1)

    let lastMove: LastMove | null = null
    if (moves && moves.length > 0) {
      const m = moves[0]
      lastMove = {
        slot: m.player_slot as number,
        type: m.move_type as LastMove['type'],
        cards: (m.cards_played as Card[] | null),
        combo: m.cards_played ? parseCombo(m.cards_played as Card[]) : null,
        bidValue: m.bid_value as number | undefined,
      }
    }

    const pub: PublicGameState = {
      gameId: session.id as string,
      roomId: session.room_id as string,
      status: session.status as PublicGameState['status'],
      currentPlayerSlot: session.current_player_slot as number,
      landlordSlot: session.landlord_slot as number | null,
      landlordCards: session.status !== 'bidding' ? (session.landlord_cards as Card[] | null) : null,
      multiplier: session.multiplier as number,
      baseBid: session.base_bid as number,
      bids: bidArr,
      cardCounts,
      lastMove,
      lastActionAt: session.last_action_at as string,
    }

    return NextResponse.json({ public: pub, private: { hand: myHand, slot: mySlot } })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'internal error' }, { status: 500 })
  }
}
