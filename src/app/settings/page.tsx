'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '../../lib/supabase/client';

export default function SettingsPage(){
  const supabase=useMemo(()=>createClient(),[]);
  const [company,setCompany]=useState('');
  const [laborRate,setLaborRate]=useState('120');
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);

  useEffect(()=>{
    void (async()=>{
      const {data:userData}=await supabase.auth.getUser();
      if(!userData.user) return;
      const {data:membership}=await supabase.from('organization_members').select('organization_id').eq('user_id',userData.user.id).limit(1);
      const orgId=membership?.[0]?.organization_id;
      if(!orgId) return;
      const {data}=await supabase.from('organizations').select('name,default_labor_rate').eq('id',orgId).single();
      if(data){
        setCompany(data.name ?? '');
        setLaborRate(String(data.default_labor_rate ?? 120));
      }
    })();
  },[supabase]);

  async function save(){
    setBusy(true);
    setMessage('');
    const {data:userData}=await supabase.auth.getUser();
    const user=userData.user;
    if(!user){setBusy(false);return;}
    const {data:membership}=await supabase.from('organization_members').select('organization_id').eq('user_id',user.id).limit(1);
    const orgId=membership?.[0]?.organization_id;
    if(!orgId){setMessage('No organization found.');setBusy(false);return;}
    const {error}=await supabase.from('organizations').update({default_labor_rate:Number(laborRate)||0}).eq('id',orgId);
    setMessage(error ? error.message : 'Settings saved.');
    setBusy(false);
  }

  return <div>
    <p className="kicker">Settings</p>
    <h1 className="page-title">Company settings</h1>
    <p className="subtitle">Defaults used across estimating, invoicing and company workflows.</p>

    <section className="card" style={{maxWidth:760}}>
      <div className="settings-row">
        <div>
          <div className="primary">Company</div>
          <div className="secondary">Current organization</div>
        </div>
        <div className="primary">{company || 'Organization'}</div>
      </div>

      <div className="settings-row">
        <div>
          <div className="primary">Default labor rate</div>
          <div className="secondary">Used as the starting hourly rate in estimates.</div>
        </div>
        <div style={{width:180}}>
          <input type="number" min="0" step="1" value={laborRate} onChange={e=>setLaborRate(e.target.value)} style={inputStyle}/>
        </div>
      </div>

      <div className="settings-row">
        <div>
          <div className="primary">Passkeys</div>
          <div className="secondary">Will be enabled after the permanent product domain is selected.</div>
        </div>
        <span className="badge">Later</span>
      </div>

      <div className="settings-row">
        <div>
          <div className="primary">Branding</div>
          <div className="secondary">Customer-facing estimates and invoices will use contractor branding without forced GPPS-app branding.</div>
        </div>
        <span className="badge">Planned</span>
      </div>

      <div className="actions" style={{marginTop:16}}>
        <button className="btn btn-primary" type="button" onClick={save} disabled={busy}>{busy?'Saving…':'Save settings'}</button>
      </div>
      {message && <div className="secondary" style={{marginTop:10}}>{message}</div>}
    </section>
  </div>
}

const inputStyle={
  width:'100%',padding:11,border:'1px solid #dfe4ea',borderRadius:10,fontSize:16,background:'white'
} as const;
