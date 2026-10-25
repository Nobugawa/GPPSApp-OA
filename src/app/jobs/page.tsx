'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { createClient } from '../../lib/supabase/client';

type Customer = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
};

type Job = {
  id: string;
  title: string;
  scope: string | null;
  status: string;
  scheduled_for: string | null;
  customer_id: string;
  customers?: Customer | null;
};

export default function Jobs(){
  const supabase = useMemo(() => createClient(), []);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [photos,setPhotos] = useState<File[]>([]);
  const [form, setForm] = useState({
    customer_id:'',
    title:'',
    scope:'',
    status:'estimate',
    scheduled_for:''
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

    const [{ data: customerData, error: customerError }, { data: jobData, error: jobError }] = await Promise.all([
      supabase
        .from('customers')
        .select('id,first_name,last_name,company_name')
        .eq('organization_id', orgId)
        .order('created_at', { ascending:false }),
      supabase
        .from('jobs')
        .select('id,title,scope,status,scheduled_for,customer_id,customers(id,first_name,last_name,company_name)')
        .eq('organization_id', orgId)
        .order('created_at', { ascending:false })
    ]);

    if (customerError) {
      setMessage(customerError.message);
      return;
    }
    if (jobError) {
      setMessage(jobError.message);
      return;
    }

    setCustomers((customerData ?? []) as Customer[]);
    setJobs((jobData ?? []) as unknown as Job[]);
  }

  useEffect(() => { void load(); }, []);

  async function uploadJobPhotos(jobId:string){
    if (!organizationId || photos.length === 0) return;

    for (const file of photos) {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g,'_');
      const path = `${organizationId}/jobs/${jobId}/${crypto.randomUUID()}-${safeName}`;

      const { error: uploadError } = await supabase.storage
        .from('job-photos')
        .upload(path,file,{upsert:false,contentType:file.type});

      if (uploadError) throw uploadError;

      const { error: attachmentError } = await supabase.from('attachments').insert({
        organization_id:organizationId,
        job_id:jobId,
        storage_provider:'supabase',
        bucket:'job-photos',
        object_path:path,
        filename:file.name,
        mime_type:file.type || null,
        byte_size:file.size,
        attachment_type:'job_photo',
        customer_visible:false
      });

      if (attachmentError) throw attachmentError;
    }
  }

  async function addJob(e: FormEvent) {
    e.preventDefault();
    if (!organizationId || !form.customer_id) return;

    setBusy(true);
    setMessage('');

    const { data:job, error } = await supabase
      .from('jobs')
      .insert({
        organization_id: organizationId,
        customer_id: form.customer_id,
        title: form.title,
        scope: form.scope || null,
        status: form.status,
        scheduled_for: form.scheduled_for ? new Date(form.scheduled_for).toISOString() : null
      })
      .select('id')
      .single();

    if (error || !job) {
      setMessage(error?.message || 'Unable to create job.');
      setBusy(false);
      return;
    }

    try {
      await uploadJobPhotos(job.id);
      setForm({customer_id:'',title:'',scope:'',status:'estimate',scheduled_for:''});
      setPhotos([]);
      setShowForm(false);
      await load();
    } catch (err) {
      setMessage('Job created, but photo upload failed: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }

    setBusy(false);
  }

  function customerName(c?: Customer | null) {
    if (!c) return 'Unknown customer';
    return c.company_name || [c.first_name,c.last_name].filter(Boolean).join(' ') || 'Unnamed customer';
  }

  return <div>
    <p className="kicker">Field work</p>
    <h1 className="page-title">Jobs</h1>
    <p className="subtitle">One place for scope, photos, appointments, estimate, invoice and job history.</p>

    <div className="card">
      <div className="actions">
        <button className="btn btn-primary" onClick={() => setShowForm(v => !v)}>+ New job</button>
      </div>

      {showForm && <form onSubmit={addJob} style={{marginTop:16}}>
        <div className="grid grid-2">
          <label>
            <div className="secondary">Customer</div>
            <select
              required
              value={form.customer_id}
              onChange={e=>setForm({...form,customer_id:e.target.value})}
              style={inputStyle}
            >
              <option value="">Select customer</option>
              {customers.map(c => <option key={c.id} value={c.id}>{customerName(c)}</option>)}
            </select>
          </label>

          <label>
            <div className="secondary">Status</div>
            <select value={form.status} onChange={e=>setForm({...form,status:e.target.value})} style={inputStyle}>
              <option value="lead">Lead</option>
              <option value="estimate">Estimate</option>
              <option value="approved">Approved</option>
              <option value="scheduled">Scheduled</option>
              <option value="in_progress">In progress</option>
              <option value="complete">Complete</option>
            </select>
          </label>

          <label style={{gridColumn:'1 / -1'}}>
            <div className="secondary">Job title</div>
            <input
              required
              value={form.title}
              onChange={e=>setForm({...form,title:e.target.value})}
              placeholder="Deck cleaning, sanding and staining"
              style={inputStyle}
            />
          </label>

          <label style={{gridColumn:'1 / -1'}}>
            <div className="secondary">Scope</div>
            <textarea
              value={form.scope}
              onChange={e=>setForm({...form,scope:e.target.value})}
              rows={5}
              placeholder="Describe the work, measurements, condition and any known constraints."
              style={{...inputStyle,resize:'vertical'}}
            />
          </label>

          <label>
            <div className="secondary">Scheduled date/time</div>
            <input
              type="datetime-local"
              value={form.scheduled_for}
              onChange={e=>setForm({...form,scheduled_for:e.target.value})}
              style={inputStyle}
            />
          </label>

          <label style={{gridColumn:'1 / -1'}}>
            <div className="secondary">Job photos</div>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              onChange={e=>setPhotos(Array.from(e.target.files ?? []))}
              style={inputStyle}
            />
            <div className="secondary">{photos.length ? `${photos.length} photo(s) selected` : 'Add photos now; they will be stored with this job.'}</div>
          </label>
        </div>

        <div className="actions" style={{marginTop:12}}>
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save job'}</button>
          <button className="btn btn-secondary" type="button" onClick={()=>{setShowForm(false);setPhotos([])}}>Cancel</button>
        </div>
      </form>}

      {message && <div className="secondary" style={{marginTop:14}}>{message}</div>}

      <div className="list" style={{marginTop:12}}>
        {jobs.length === 0 && organizationId && <div className="secondary">No jobs yet. Create the first real GPPS job above.</div>}
        {jobs.map(j => <div className="list-item" key={j.id}>
          <div>
            <div className="primary">{j.title}</div>
            <div className="secondary">
              {customerName(j.customers)}
              {j.scope ? ' · ' + j.scope : ''}
            </div>
          </div>
          <span className={j.status === 'complete' ? 'badge success' : 'badge'}>{j.status.replace('_',' ')}</span>
        </div>)}
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
