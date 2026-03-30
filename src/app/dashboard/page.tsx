import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .single()

  return (
    <main className="min-h-screen bg-ink safe-top safe-bottom">
      {/* Header */}
      <header className="px-5 pt-6 pb-4 flex items-center justify-between border-b border-parchment/10">
        <div>
          <h1 className="font-chinese text-2xl text-gold">
            {profile?.display_name || user.email}
          </h1>
          {profile?.player_id && (
            <p className="text-parchment/40 text-xs font-body mt-0.5">
              {profile.player_id}
            </p>
          )}
        </div>
        <Link href="/profile" className="w-10 h-10 rounded-full bg-ink-light border border-gold/30 flex items-center justify-center">
          <span className="text-gold text-sm">
            {(profile?.display_name || user.email || 'U')[0].toUpperCase()}
          </span>
        </Link>
      </header>

      {/* Quick actions */}
      <div className="px-5 py-6 grid grid-cols-2 gap-3">
        <Link href="/rooms" className="bg-ink-light border border-gold/20 rounded-xl p-5 hover:border-gold/40 transition-all">
          <div className="text-2xl mb-2">🃏</div>
          <h2 className="font-display text-gold text-sm tracking-wider mb-1">Rooms</h2>
          <p className="text-parchment/40 text-xs">Join or create game rooms</p>
        </Link>
        <Link href="/friends" className="bg-ink-light border border-gold/20 rounded-xl p-5 hover:border-gold/40 transition-all">
          <div className="text-2xl mb-2">👥</div>
          <h2 className="font-display text-gold text-sm tracking-wider mb-1">Friends</h2>
          <p className="text-parchment/40 text-xs">Manage your friends list</p>
        </Link>
        <Link href="/training" className="col-span-2 bg-ink-light border border-gold/20 rounded-xl p-5 hover:border-gold/40 transition-all flex items-center gap-4">
          <div className="text-2xl">⚔️</div>
          <div>
            <h2 className="font-display text-gold text-sm tracking-wider mb-1">Entraînement</h2>
            <p className="text-parchment/40 text-xs">Joue contre l'IA — niveaux 1 à 3</p>
          </div>
        </Link>
      </div>

      {/* Card suits decoration */}
      <div className="flex justify-center gap-6 text-3xl opacity-10 mt-8">
        <span>♠</span>
        <span className="text-crimson">♥</span>
        <span className="text-crimson">♦</span>
        <span>♣</span>
      </div>
    </main>
  )
}
