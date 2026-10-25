'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { createClient } from '../../lib/supabase/client';

type Customer = {
  id: string;
  customer_number: string | null;
  account_type: string;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  email: string | null;
  created_at: string;
};

type PhoneDraft = {
  phone_type: 'mobile' | 'home' | 'work' | 'office' | 'fax' | 'other';
  phone_number: string;
  is_primary: boolean;
  sms_capable: boolean;
};

const emptyPhone = (): PhoneDraft => ({
  phone_type:'mobile',
  phone_number:'',
  is_primary:true,
  sms_capable:true
});

export default function Customers(){
  const supabase = useMemo(() => createClient(), []);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [phones,setPhones] = useState<PhoneDraft[]>([emptyPhone()]);
  const [form, setForm] = useState({
    account_type:'residential',
    first_name:'',
    last_name:'',
    company_name:'',
    email:'',
    address1:'',
    address2:'',
    city:'',
    state:'NJ',
    postal_code:''
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
      .select('id,customer_number,account_type,first_name,last_name,company_name,email,created_at')
      .eq('organization_id', orgId)
      .order('created_at', { ascending:false });

    if (error) setMessage(error.message);
    else setCustomers((data ?? []) as Customer[]);
  }

  useEffect(() => { void load(); }, []);

  function resetForm(){
    setForm({
      account_type:'residential',
      first_name:'',
      last_name:'',
      company_name:'',
      email:'',
      address1:'',
      address2:'',
      city:'',
      state:'NJ',
      postal_code:''
    });
    setPhones([emptyPhone()]);
  }

  async function addCustomer(e: FormEvent) {
    e.preventDefault();
    if (!organizationId) return;
    setBusy(true);
    setMessage('');

    const isResidential = form.account_type === 'residential';

    const { data: customer, error: customerError } = await supabase
      .from('customers')
      .insert({
        organization_id: organizationId,
        account_type: form.account_type,
        first_name: form.first_name || null,
        last_name: form.last_name || null,
        company_name: isResidential ? null : (form.company_name || null),
        email: form.email || null,
        source: 'manual'
      })
      .select('id')
      .single();

    if (customerError || !customer) {
      setMessage(customerError?.message || 'Unable to create customer.');
      setBusy(false);
      return;
    }

    const validPhones = phones.filter(p => p.phone_number.trim());
    if (validPhones.length) {
      const { error: phoneError } = await supabase.from('customer_phones').insert(
        validPhones.map(p => ({
          organization_id: organizationId,
          customer_id: customer.id,
          phone_type: p.phone_type,
          phone_number: p.phone_number.trim(),
          is_primary: p.is_primary,
          sms_capable: p.sms_capable
        }))
      );

      if (phoneError) {
        setMessage('Customer created, but phone numbers failed to save: ' + phoneError.message);
        setBusy(false);
        return;
      }
    }

    if (form.address1.trim()) {
      const { error: propertyError } = await supabase.from('properties').insert({
        organization_id: organizationId,
        customer_id: customer.id,
        label: isResidential ? 'Home' : 'Primary site',
        address1: form.address1.trim(),
        address2: form.address2.trim() || null,
        city: form.city.trim() || null,
        state: form.state.trim() || null,
        postal_code: form.postal_code.trim() || null
      });

      if (propertyError) {
        setMessage('Customer created, but address failed to save: ' + propertyError.message);
        setBusy(false);
        return;
      }
    }

    resetForm();
    setShowForm(false);
    await load();
    setBusy(false);
  }

  function updatePhone(index:number, patch:Partial<PhoneDraft>){
    setPhones(prev => prev.map((p,i) => i === index ? {...p,...patch} : p));
  }

  return <div>
    <p className="kicker">CRM</p>
    <h1 className="page-title">Customers</h1>
    <p className="subtitle">Residential, commercial and managed-property accounts with one or many service locations.</p>

    <div className="card">
      <div className="actions">
        <button className="btn btn-primary" onClick={() => setShowForm(v => !v)}>+ Add customer</button>
        <button className="btn btn-secondary" type="button">Import contacts</button>
      </div>

      {showForm && <form onSubmit={addCustomer} style={{marginTop:16}}>
        <div className="grid grid-2">
          <label>
            <div className="secondary">Account type</div>
            <select
              value={form.account_type}
              onChange={e=>setForm({...form,account_type:e.target.value})}
              style={inputStyle}
            >
              <option value="residential">Residential</option>
              <option value="commercial">Commercial</option>
              <option value="property_management">Property management</option>
              <option value="landlord_investor">Landlord / investor</option>
              <option value="hoa_condo">HOA / condo association</option>
              <option value="institutional">Institutional</option>
              <option value="mixed">Mixed</option>
            </select>
          </label>

          {form.account_type !== 'residential' && <label>
            <div className="secondary">Company / account name</div>
            <input value={form.company_name} onChange={e=>setForm({...form,company_name:e.target.value})} style={inputStyle}/>
          </label>}

          <label><div className="secondary">First name</div><input value={form.first_name} onChange={e=>setForm({...form,first_name:e.target.value})} style={inputStyle}/></label>
          <label><div className="secondary">Last name</div><input value={form.last_name} onChange={e=>setForm({...form,last_name:e.target.value})} style={inputStyle}/></label>

          <label style={{gridColumn:'1 / -1'}}><div className="secondary">Email (optional)</div><input type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} style={inputStyle}/></label>

          <div style={{gridColumn:'1 / -1'}}>
            <div className="group-head"><strong>Phone numbers</strong><button className="btn btn-secondary" type="button" onClick={()=>setPhones([...phones,{...emptyPhone(),is_primary:false}])}>+ Add phone</button></div>
            {phones.map((p,index)=><div className="grid grid-2" style={{marginBottom:10}} key={index}>
              <select value={p.phone_type} onChange={e=>updatePhone(index,{phone_type:e.target.value as PhoneDraft['phone_type']})} style={inputStyle}>
                <option value="mobile">Mobile</option>
                <option value="home">Home</option>
                <option value="work">Work</option>
                <option value="office">Office</option>
                <option value="fax">Fax</option>
                <option value="other">Other</option>
              </select>
              <input type="tel" value={p.phone_number} onChange={e=>updatePhone(index,{phone_number:e.target.value})} placeholder="Phone number" style={inputStyle}/>
              <label className="secondary"><input type="checkbox" checked={p.is_primary} onChange={e=>updatePhone(index,{is_primary:e.target.checked})}/> Primary</label>
              <label className="secondary"><input type="checkbox" checked={p.sms_capable} onChange={e=>updatePhone(index,{sms_capable:e.target.checked})}/> Can receive SMS</label>
            </div>)}
          </div>

          <label style={{gridColumn:'1 / -1'}}><div className="secondary">Address</div><input value={form.address1} onChange={e=>setForm({...form,address1:e.target.value})} placeholder="Street address" style={inputStyle}/></label>
          <label style={{gridColumn:'1 / -1'}}><div className="secondary">Address 2</div><input value={form.address2} onChange={e=>setForm({...form,address2:e.target.value})} placeholder="Unit, suite, apartment" style={inputStyle}/></label>
          <label><div className="secondary">City</div><input value={form.city} onChange={e=>setForm({...form,city:e.target.value})} style={inputStyle}/></label>
          <label><div className="secondary">State</div><input value={form.state} onChange={e=>setForm({...form,state:e.target.value})} style={inputStyle}/></label>
          <label><div className="secondary">ZIP / postal code</div><input value={form.postal_code} onChange={e=>setForm({...form,postal_code:e.target.value})} style={inputStyle}/></label>
        </div>

        <div className="actions" style={{marginTop:12}}>
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save customer'}</button>
          <button className="btn btn-secondary" type="button" onClick={()=>{resetForm();setShowForm(false)}}>Cancel</button>
        </div>
      </form>}

      {message && <div className="secondary" style={{marginTop:14}}>{message}</div>}

      <div className="list" style={{marginTop:12}}>
        {customers.length === 0 && organizationId && <div className="secondary">No customers yet. Add the first real GPPS customer above.</div>}
        {customers.map(c => {
          const name = c.company_name || [c.first_name,c.last_name].filter(Boolean).join(' ') || 'Unnamed customer';
          return <div className="list-item" key={c.id}>
            <div>
              <div className="primary">#{c.customer_number ?? '—'} · {name}</div>
              <div className="secondary">{c.account_type.replace('_',' ')}{c.email ? ' · ' + c.email : ''}</div>
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
  fontSize:16,
  background:'white'
} as const;
