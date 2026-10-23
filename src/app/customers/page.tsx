'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { createClient } from '../../lib/supabase/client';

type Customer = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  email: string | null;
  phone: string | null;
  created_at: string;
};

export default function Customers(){
  const supabase = useMemo(() => createClient(), []);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({
    first_name:'', last_name:'', company_name:'', email:'', phone:''
  });

  async function load() {
    setMessage('');
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;

    const { data: memberships, error: memberError } = await supabase
      .from('organization_members')
      .select('organization_id, role')
      .eq('user_id', userData.user.id)
      .limit(1);

    if (memberError) {
      setMessage(memberError.message);
      return;
    }

    const orgId = memberships?.[0]?.organization_id ?? null;
    setOrganizationId(orgId);

    if (!orgId) {
      setMessage('Your login is active, but it has not yet been attached to a company workspace.');
      return;
    }

    const { data, error } = await supabase
      .from('customers')
      .select('id,first_name,last_name,company_name,email,phone,created_at')
      .eq('organization_id', orgId)
      .order('created_at', { ascending:false });

    if (error) setMessage(error.message);
    else setCustomers((data ?? []) as Customer[]);
  }

  useEffect(() => { void load(); }, []);

  async function addCustomer(e: FormEvent) {
    e.preventDefault();
    if (!organizationId) return;
    setBusy(true);
    setMessage('');

    const { error } = await supabase.from('customers').insert({
      organization_id: organizationId,
      first_name: form.first_name || null,
      last_name: form.last_name || null,
      company_name: form.company_name || null,
      email: form.email || null,
      phone: form.phone || null,
      source: 'manual'
    });

    if (error) {
      setMessage(error.message);
    } else {
      setForm({first_name:'',last_name:'',company_name:'',email:'',phone:''});
      setShowForm(false);
      await load();
    }
    setBusy(false);
  }

  return <div>
    <p className="kicker">CRM</p>
    <h1 className="page-title">Customers</h1>
    <p className="subtitle">Customers and properties stay separate so one customer can own multiple locations.</p>

    <div className="card">
      <div className="actions">
        <button className="btn btn-primary" onClick={() => setShowForm(v => !v)}>+ Add customer</button>
        <button className="btn btn-secondary" type="button">Import contacts</button>
      </div>

      {showForm && <form onSubmit={addCustomer} style={{marginTop:16}}>
        <div className="grid grid-2">
          <label><div className="secondary">First name</div><input value={form.first_name} onChange={e=>setForm({...form,first_name:e.target.value})} style={inputStyle}/></label>
          <label><div className="secondary">Last name</div><input value={form.last_name} onChange={e=>setForm({...form,last_name:e.target.value})} style={inputStyle}/></label>
          <label><div className="secondary">Company</div><input value={form.company_name} onChange={e=>setForm({...form,company_name:e.target.value})} style={inputStyle}/></label>
          <label><div className="secondary">Phone</div><input type="tel" value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} style={inputStyle}/></label>
          <label style={{gridColumn:'1 / -1'}}><div className="secondary">Email</div><input type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} style={inputStyle}/></label>
        </div>
        <div className="actions" style={{marginTop:12}}>
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save customer'}</button>
          <button className="btn btn-secondary" type="button" onClick={()=>setShowForm(false)}>Cancel</button>
        </div>
      </form>}

      {message && <div className="secondary" style={{marginTop:14}}>{message}</div>}

      <div className="list" style={{marginTop:12}}>
        {customers.length === 0 && organizationId && <div className="secondary">No customers yet. Add the first real GPPS customer above.</div>}
        {customers.map(c => {
          const name = c.company_name || [c.first_name,c.last_name].filter(Boolean).join(' ') || 'Unnamed customer';
          return <div className="list-item" key={c.id}>
            <div>
              <div className="primary">{name}</div>
              <div className="secondary">{[c.phone,c.email].filter(Boolean).join(' · ') || 'No contact details yet'}</div>
            </div>
            <span className="badge">Customer</span>
          </div>;
        })}
      </div>
    </div>
  </div>
}

const inputStyle = {
  width:'100%',
  marginTop:6,
  padding:12,
  border:'1px solid #dfe4ea',
  borderRadius:10,
  fontSize:16
} as const;
