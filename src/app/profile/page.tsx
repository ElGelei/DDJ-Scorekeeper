export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import ProfileEditor from '@/components/ProfileEditor'

export default async function ProfilePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/dashboard')

  return (
    <main
      className="min-h-screen px-5 pt-6 pb-20"
      style={{
        backgroundColor: '#1A0A00',
        backgroundImage: 'radial-gradient(ellipse at 20% 20%, rgba(139,0,0,0.2) 0%, transparent 50%)',
        color: '#F5ECD7',
      }}
    >
      <Link href="/dashboard" className="text-[#C9A84C]/60 hover:text-[#C9A84C] text-xs font-display tracking-wider transition-colors">
        ← Dashboard
      </Link>

      <div className="flex items-center gap-4 mt-5 mb-8">
        <div className="w-14 h-14 rounded-full bg-[#C9A84C]/15 border border-[#C9A84C]/30 flex items-center justify-center flex-shrink-0">
          <span className="font-chinese text-2xl text-[#C9A84C]">
            {profile.display_name[0].toUpperCase()}
          </span>
        </div>
        <div>
          <h1 className="font-display text-[#C9A84C] text-lg tracking-wider">{profile.display_name}</h1>
          <p className="text-[#F5ECD7]/30 text-xs font-body mt-0.5">{profile.player_id}</p>
        </div>
      </div>

      <ProfileEditor
        userId={user.id}
        initialDisplayName={profile.display_name}
        playerId={profile.player_id}
        email={user.email ?? ''}
      />
    </main>
  )
}
