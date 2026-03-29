# 斗地主 Doh Di Jow — Setup Guide

## 1. Supabase Setup

1. Create a new project at https://supabase.com
2. Go to **SQL Editor** and run the contents of `supabase/schema.sql`
3. In **Authentication > Providers**, enable:
   - **Google**: add Client ID + Secret from Google Cloud Console
   - **Apple**: add Service ID + Key from Apple Developer
   - **Email**: already enabled by default
4. In **Authentication > URL Configuration**, set:
   - Site URL: `http://localhost:3000` (dev) or your Vercel URL (prod)
   - Redirect URLs: add `http://localhost:3000/auth/callback` and `https://your-app.vercel.app/auth/callback`

## 2. Environment Variables

Copy `.env.example` to `.env.local` and fill in:
```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

Find these in: Supabase Dashboard > Settings > API

## 3. Local Development

```bash
npm run dev
```

## 4. Deploy to Vercel

```bash
npx vercel
```

Add the same env vars in Vercel Dashboard > Settings > Environment Variables.

## 5. PWA Icons

Add icons to `/public/icons/`:
- `icon-192x192.png`
- `icon-512x512.png`

## 6. Google Fonts

The app uses Google Fonts (loaded in globals.css). For offline PWA support, consider self-hosting the fonts.
