import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import FriendManager from '@/components/FriendManager'

export default async function FriendsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .single()

  const { data: friendships } = await supabase
    .from('friendships')
    .select(`
      id, status, requester_id, addressee_id,
      requester:users!friendships_requester_id_fkey(id, display_name, player_id),
      addressee:users!friendships_addressee_id_fkey(id, display_name, player_id)
    `)
    .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)

  return (
    <main className="min-h-screen bg-[#1A0A00] text-[#F5ECD7] px-5 pt-6 pb-20"
      style={{
        backgroundImage: 'radial-gradient(ellipse at 20% 20%, rgba(139,0,0,0.2) 0%, transparent 50%)'
      }}
    >
      <Link href="/dashboard" className="text-[#C9A84C]/60 hover:text-[#C9A84C] text-xs font-display tracking-wider transition-colors">
        ← Dashboard
      </Link>
      <h1 className="font-display text-[#C9A84C] text-xl tracking-wider mt-4 mb-1">Friends</h1>
      {profile && (
        <p className="text-[#F5ECD7]/30 text-xs font-body italic mb-6">Your ID: {profile.player_id}</p>
      )}
      <FriendManager
        currentUserId={user.id}
        initialFriendships={(friendships ?? []) as any}
      />
    </main>
  )
}
