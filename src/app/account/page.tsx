'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '../../lib/supabase/client';

type Membership = {
  role: string;
  organizations: { name: string; slug: string | null } | null;
};

export default function AccountPage(){
  const supabase = useMemo(()=>createClient(),[]);
  const [email,setEmail] = useState('');
  const [memberships,setMemberships] = useState<Membership[]>([]);
  const [message,setMessage] = useState('');

  useEffect(()=>{
    void (async ()=>{
      const { data:userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) return;
      setEmail(user.email ?? '');

      const { data,error } = await supabase
        .from('organization_members')
        .select('role,organizations(name,slug)')
        .eq('user_id',user.id);

      if (error) setMessage(error.message);
      else setMemberships((data ?? []) as unknown as Membership[]);
    })();
  },[supabase]);

  return <div>
    <p className="kicker">Account</p>
    <h1 className="page-title">My account</h1>
    <p className="subtitle">Identity, company memberships and access level.</p>

    <div className="grid grid-2">
      <section className="card">
        <h2 className="section-title">Login</h2>
        <div className="primary">{email || 'Signed-in user'}</div>
        <div className="secondary">One login can belong to multiple organizations or divisions.</div>
      </section>

      <section className="card">
        <h2 className="section-title">Platform access</h2>
        <div className="primary">Platform Super Admin</div>
        <div className="secondary">Reserved for the Grey Matter Fusion platform operator.</div>
      </section>
    </div>

    <section className="card" style={{marginTop:16}}>
      <h2 className="section-title">Company access</h2>
      {memberships.length === 0 && <div className="secondary">No organization membership is attached yet.</div>}
      <div className="list">
        {memberships.map((m,i)=><div className="list-item" key={i}>
          <div>
            <div className="primary">{m.organizations?.name ?? 'Organization'}</div>
            <div className="secondary">{m.organizations?.slug ?? ''}</div>
          </div>
          <span className="badge">{m.role}</span>
        </div>)}
      </div>
      {message && <div className="secondary" style={{marginTop:12}}>{message}</div>}
    </section>
  </div>
}
