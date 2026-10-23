'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../lib/supabase/client';

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage('');

    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.replace('/dashboard');
        router.refresh();
        return;
      }

      const origin = window.location.origin;
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: origin + '/auth/callback' }
      });
      if (error) throw error;

      if (data.session) {
        router.replace('/dashboard');
        router.refresh();
      } else {
        setMessage('Account created. Check your email to confirm your address, then sign in.');
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Unable to sign in.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{maxWidth:460,margin:'48px auto'}}>
      <section className="card">
        <p className="kicker">Secure access</p>
        <h1 className="page-title" style={{fontSize:28}}>
          {mode === 'signin' ? 'Sign in' : 'Create account'}
        </h1>
        <p className="subtitle">
          {mode === 'signin'
            ? 'Access your GPPS workspace.'
            : 'Create your login. Organization access is granted separately.'}
        </p>

        <form onSubmit={submit} className="list">
          <label>
            <div className="secondary" style={{marginBottom:6}}>Email</div>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              style={{width:'100%',padding:12,border:'1px solid #dfe4ea',borderRadius:10,fontSize:16}}
            />
          </label>

          <label>
            <div className="secondary" style={{marginBottom:6}}>Password</div>
            <div style={{display:'flex',gap:8}}>
              <input
                type={showPassword ? 'text' : 'password'}
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                required
                minLength={8}
                value={password}
                onChange={e => setPassword(e.target.value)}
                style={{flex:1,minWidth:0,padding:12,border:'1px solid #dfe4ea',borderRadius:10,fontSize:16}}
              />
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowPassword(v => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </label>

          {message && <div className="card" style={{padding:12,background:'#f8fafc'}}>{message}</div>}

          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? 'Working…' : mode === 'signin' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <button
          type="button"
          className="btn btn-secondary"
          style={{marginTop:12,width:'100%'}}
          onClick={() => {
            setMode(mode === 'signin' ? 'signup' : 'signin');
            setMessage('');
          }}
        >
          {mode === 'signin' ? 'Need an account? Create one' : 'Already have an account? Sign in'}
        </button>

        <p className="secondary" style={{marginTop:14}}>
          Passkeys will be added after the permanent product domain is selected.
        </p>
      </section>
    </div>
  );
}
