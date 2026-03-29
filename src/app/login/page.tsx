'use client'

import { useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

function LoginForm() {
  const searchParams = useSearchParams()
  const [tab, setTab] = useState<'login' | 'signup'>(
    searchParams.get('tab') === 'signup' ? 'signup' : 'login'
  )
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const supabase = createClient()

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setMessage(null)

    if (tab === 'signup') {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { display_name: displayName },
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      })
      if (error) setError(error.message)
      else setMessage('Check your email to confirm your account.')
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setError(error.message)
      else window.location.href = '/dashboard'
    }

    setLoading(false)
  }

  const handleOAuth = async (provider: 'google' | 'apple') => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
    if (error) setError(error.message)
  }

  return (
    <main className="min-h-screen bg-ink flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="text-center mb-8">
          <span className="font-chinese text-5xl text-gold">斗地主</span>
          <p className="font-display text-xs text-parchment/40 tracking-widest mt-1">
            DOH DI JOW
          </p>
        </div>

        {/* Tab switcher */}
        <div className="flex mb-6 bg-ink-light rounded-lg p-1">
          {(['login', 'signup'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2 rounded-md text-sm font-display tracking-wider uppercase transition-all duration-200 ${
                tab === t
                  ? 'bg-gold text-ink font-bold'
                  : 'text-parchment/50 hover:text-parchment/80'
              }`}
            >
              {t === 'login' ? 'Sign In' : 'Sign Up'}
            </button>
          ))}
        </div>

        {/* OAuth buttons */}
        <div className="flex flex-col gap-3 mb-6">
          <button
            onClick={() => handleOAuth('google')}
            className="w-full py-3 flex items-center justify-center gap-3 border border-parchment/20 rounded-lg text-parchment/80 text-sm hover:border-gold/40 hover:bg-ink-light transition-all duration-200"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </button>
          <button
            onClick={() => handleOAuth('apple')}
            className="w-full py-3 flex items-center justify-center gap-3 border border-parchment/20 rounded-lg text-parchment/80 text-sm hover:border-gold/40 hover:bg-ink-light transition-all duration-200"
          >
            <svg className="w-5 h-5 fill-parchment" viewBox="0 0 24 24">
              <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.54 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701"/>
            </svg>
            Continue with Apple
          </button>
        </div>

        {/* Divider */}
        <div className="flex items-center gap-3 mb-6">
          <div className="h-px flex-1 bg-parchment/10" />
          <span className="text-parchment/30 text-xs font-display tracking-widest">OR</span>
          <div className="h-px flex-1 bg-parchment/10" />
        </div>

        {/* Email form */}
        <form onSubmit={handleEmailAuth} className="flex flex-col gap-3">
          {tab === 'signup' && (
            <input
              type="text"
              placeholder="Display Name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              className="w-full px-4 py-3 bg-ink-light border border-parchment/15 rounded-lg text-parchment placeholder-parchment/30 text-sm focus:outline-none focus:border-gold/50 transition-colors"
            />
          )}
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full px-4 py-3 bg-ink-light border border-parchment/15 rounded-lg text-parchment placeholder-parchment/30 text-sm focus:outline-none focus:border-gold/50 transition-colors"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            className="w-full px-4 py-3 bg-ink-light border border-parchment/15 rounded-lg text-parchment placeholder-parchment/30 text-sm focus:outline-none focus:border-gold/50 transition-colors"
          />

          {error && (
            <p className="text-crimson-light text-xs text-center py-2">{error}</p>
          )}
          {message && (
            <p className="text-gold text-xs text-center py-2">{message}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 bg-gold-gradient text-ink font-display font-bold tracking-widest rounded-lg text-sm uppercase transition-all duration-200 hover:opacity-90 active:scale-95 disabled:opacity-50 mt-1"
          >
            {loading ? '...' : tab === 'login' ? 'Sign In' : 'Create Account'}
          </button>
        </form>
      </div>
    </main>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-ink flex items-center justify-center">
        <span className="font-chinese text-4xl text-gold animate-pulse">斗地主</span>
      </div>
    }>
      <LoginForm />
    </Suspense>
  )
}
