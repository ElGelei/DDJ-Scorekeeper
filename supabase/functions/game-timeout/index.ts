import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

Deno.serve(async (_req) => {
  const now = new Date()

  // Get all active games
  const { data: sessions } = await supabaseAdmin
    .from('game_sessions')
    .select('*')
    .in('status', ['bidding', 'playing'])

  for (const session of sessions ?? []) {
    const lastAction = new Date(session.last_action_at)
    const elapsedMs = now.getTime() - lastAction.getTime()
    const timeoutMs = session.status === 'bidding' ? 20_000 : 30_000

    if (elapsedMs < timeoutMs) continue

    const slot = session.current_player_slot

    if (session.status === 'bidding') {
      // Auto bid 0
      await supabaseAdmin.from('game_bids').upsert({ game_id: session.id, player_slot: slot, bid_value: 0 })
      await supabaseAdmin.from('game_moves').insert({ game_id: session.id, player_slot: slot, move_type: 'timeout', bid_value: 0 })

      // Check all bids
      const { data: allBids } = await supabaseAdmin.from('game_bids').select('*').eq('game_id', session.id)
      const allBid = allBids && allBids.filter((b: Record<string, unknown>) => b.bid_value !== null).length === 3

      if (allBid) {
        const maxBid = Math.max(...(allBids ?? []).map((b: Record<string, unknown>) => (b.bid_value as number) ?? 0))
        if (maxBid === 0) {
          // Rebid
          await supabaseAdmin.from('game_bids').update({ bid_value: null }).eq('game_id', session.id)
          await supabaseAdmin.from('game_sessions').update({ current_player_slot: 0, last_action_at: now.toISOString() }).eq('id', session.id)
        } else {
          const winnerBid = (allBids ?? [])
            .filter((b: Record<string, unknown>) => b.bid_value === maxBid)
            .sort((a: Record<string, unknown>, b: Record<string, unknown>) => (b.player_slot as number) - (a.player_slot as number))[0]
          const landlordSlot = winnerBid.player_slot
          const { data: hand } = await supabaseAdmin.from('game_hands').select('cards').eq('game_id', session.id).eq('player_slot', landlordSlot).single()
          const newHand = [...((hand?.cards as unknown[]) ?? []), ...((session.landlord_cards as unknown[]) ?? [])]
          await supabaseAdmin.from('game_hands').update({ cards: newHand }).eq('game_id', session.id).eq('player_slot', landlordSlot)
          await supabaseAdmin.from('game_sessions').update({
            status: 'playing', landlord_slot: landlordSlot, current_player_slot: landlordSlot,
            base_bid: maxBid, multiplier: maxBid, last_action_at: now.toISOString(),
          }).eq('id', session.id)
        }
      } else {
        const nextSlot = (slot + 1) % 3
        await supabaseAdmin.from('game_sessions').update({ current_player_slot: nextSlot, last_action_at: now.toISOString() }).eq('id', session.id)
      }
    } else {
      // Auto pass or play weakest card
      const { data: recentMoves } = await supabaseAdmin
        .from('game_moves').select('player_slot, move_type').eq('game_id', session.id)
        .order('played_at', { ascending: false }).limit(6)

      const lastPlay = (recentMoves as Array<{ player_slot: number; move_type: string }> | null)
        ?.find((m) => m.move_type === 'play')
      const mustPlay = !lastPlay || lastPlay.player_slot === slot

      if (mustPlay) {
        // Play weakest single card
        const { data: hand } = await supabaseAdmin.from('game_hands').select('cards').eq('game_id', session.id).eq('player_slot', slot).single()
        const cards = ((hand?.cards as Array<{ id: string; value: number }>) ?? [])
        if (cards.length > 0) {
          const weakest = cards.slice().sort((a, b) => a.value - b.value)[0]
          const remaining = cards.filter((c) => c.id !== weakest.id)
          await supabaseAdmin.from('game_hands').update({ cards: remaining }).eq('game_id', session.id).eq('player_slot', slot)
          await supabaseAdmin.from('game_moves').insert({ game_id: session.id, player_slot: slot, move_type: 'timeout', cards_played: [weakest] })

          if (remaining.length === 0) {
            await supabaseAdmin.from('game_sessions').update({ status: 'finished', last_action_at: now.toISOString() }).eq('id', session.id)
            continue
          }
        }
      } else {
        // Auto pass
        await supabaseAdmin.from('game_moves').insert({ game_id: session.id, player_slot: slot, move_type: 'timeout' })
      }

      const nextSlot = (slot + 1) % 3
      await supabaseAdmin.from('game_sessions').update({ current_player_slot: nextSlot, last_action_at: now.toISOString() }).eq('id', session.id)
    }
  }

  return new Response(JSON.stringify({ ok: true, processed: sessions?.length ?? 0 }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
