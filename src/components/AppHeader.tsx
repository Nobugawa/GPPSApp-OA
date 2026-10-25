'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../lib/supabase/client';

export default function AppHeader(){
  const [open,setOpen] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function signOut(){
    await supabase.auth.signOut();
    router.replace('/login');
    router.refresh();
  }

  return (
    <header className="topbar">
      <Link href="/dashboard" className="brand">GPPS Field</Link>
      <div className="top-actions">
        <button className="icon-btn" aria-label="Search">⌕</button>
        <div style={{position:'relative'}}>
          <button className="icon-btn" aria-label="Menu" onClick={()=>setOpen(v=>!v)}>☰</button>
          {open && (
            <div className="account-menu">
              <Link href="/account" onClick={()=>setOpen(false)}>Account</Link>
              <Link href="/settings" onClick={()=>setOpen(false)}>Settings</Link>
              <button type="button" onClick={signOut}>Sign out</button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
