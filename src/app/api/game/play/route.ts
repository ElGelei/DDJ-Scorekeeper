import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { parseCombo, isValidPlay, type Card } from '@/lib/ddz/engine'

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
    const { game_id, cards }: { game_id: string; cards: Card[] } = await req.json()
    if (!game_id || !cards) return NextResponse.json({ error: 'game_id and cards required' }, { status: 400 })

    const user = await getAuthUser(req)
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const { data: session } = await supabaseAdmin.from('game_sessions').select('*').eq('id', game_id).single()
    if (!session) return NextResponse.json({ error: 'game not found' }, { status: 404 })
    if (session.status !== 'playing') return NextResponse.json({ error: 'not in playing phase' }, { status: 400 })

    const { data: member } = await supabaseAdmin
      .from('room_members').select('pvp_slot').eq('room_id', session.room_id).eq('user_id', user.id).single()
    if (!member) return NextResponse.json({ error: 'not in game' }, { status: 403 })

    const slot = member.pvp_slot as number
    if (session.current_player_slot !== slot) return NextResponse.json({ error: 'not your turn' }, { status: 400 })

    // Get current hand
    const { data: handRow } = await supabaseAdmin.from('game_hands').select('cards').eq('game_id', game_id).eq('player_slot', slot).single()
    const currentHand: Card[] = (handRow?.cards as Card[]) ?? []

    // Validate cards are in hand
    const playIds = new Set(cards.map((c: Card) => c.id))
    const validCards = currentHand.filter((c: Card) => playIds.has(c.id))
    if (validCards.length !== cards.length) return NextResponse.json({ error: 'cards not in hand' }, { status: 400 })

    // Get last played combo from moves
    const { data: moves } = await supabaseAdmin
      .from('game_moves')
      .select('*')
      .eq('game_id', game_id)
      .eq('move_type', 'play')
      .order('played_at', { ascending: false })
      .limit(3)

    // Determine effective last played
    let lastPlayed = null
    if (moves && moves.length > 0) {
      const lastPlay = moves[0]
      if (lastPlay.player_slot !== slot) {
        lastPlayed = parseCombo((lastPlay.cards_played as Card[]) ?? [])
      }
    }

    // Validate combo
    const combo = parseCombo(cards)
    if (!combo) return NextResponse.json({ error: 'invalid combination' }, { status: 400 })
    if (!isValidPlay(combo, lastPlayed)) return NextResponse.json({ error: 'cannot beat last play' }, { status: 400 })

    // Update hand
    const remainingHand = currentHand.filter((c: Card) => !playIds.has(c.id))
    await supabaseAdmin.from('game_hands').update({ cards: remainingHand }).eq('game_id', game_id).eq('player_slot', slot)

    // Record move
    await supabaseAdmin.from('game_moves').insert({
      game_id,
      player_slot: slot,
      move_type: 'play',
      cards_played: cards,
    })

    // Check win
    if (remainingHand.length === 0) {
      const isLandlord = session.landlord_slot === slot
      const multiplier = session.multiplier

      await supabaseAdmin.from('game_sessions').update({
        status: 'finished',
        last_action_at: new Date().toISOString(),
      }).eq('id', game_id)

      return NextResponse.json({
        status: 'finished',
        winner: slot,
        isLandlord,
        multiplier,
        hand: remainingHand,
      })
    }

    // Next player
    const nextSlot = (slot + 1) % 3
    await supabaseAdmin.from('game_sessions').update({
      current_player_slot: nextSlot,
      last_action_at: new Date().toISOString(),
    }).eq('id', game_id)

    return NextResponse.json({ status: 'ok', hand: remainingHand, nextSlot, combo })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'internal error' }, { status: 500 })
  }
}
