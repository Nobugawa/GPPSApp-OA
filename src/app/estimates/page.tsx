'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { createClient } from '../../lib/supabase/client';

type Job = {
  id:string;
  title:string;
  customer_id:string;
  customers?: {
    first_name:string | null;
    last_name:string | null;
    company_name:string | null;
  } | null;
};

export default function Estimates(){
  const supabase = useMemo(()=>createClient(),[]);
  const [organizationId,setOrganizationId] = useState<string | null>(null);
  const [jobs,setJobs] = useState<Job[]>([]);
  const [jobId,setJobId] = useState('');
  const [photos,setPhotos] = useState<File[]>([]);
  const [message,setMessage] = useState('');
  const [busy,setBusy] = useState(false);

  useEffect(()=>{
    void (async ()=>{
      const { data:userData } = await supabase.auth.getUser();
      if (!userData.user) return;

      const { data:memberships,error:memberError } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id',userData.user.id)
        .limit(1);

      if (memberError) {
        setMessage(memberError.message);
        return;
      }

      const orgId = memberships?.[0]?.organization_id ?? null;
      setOrganizationId(orgId);
      if (!orgId) {
        setMessage('No company workspace is attached to this login.');
        return;
      }

      const { data,error } = await supabase
        .from('jobs')
        .select('id,title,customer_id,customers(first_name,last_name,company_name)')
        .eq('organization_id',orgId)
        .order('created_at',{ascending:false});

      if (error) setMessage(error.message);
      else setJobs((data ?? []) as unknown as Job[]);
    })();
  },[supabase]);

  function jobLabel(job:Job){
    const c=job.customers;
    const customer=c?.company_name || [c?.first_name,c?.last_name].filter(Boolean).join(' ') || 'Customer';
    return customer + ' — ' + job.title;
  }

  async function saveDraft(e:FormEvent){
    e.preventDefault();
    if (!organizationId || !jobId) return;
    setBusy(true);
    setMessage('');

    const { data:estimate,error } = await supabase
      .from('estimates')
      .insert({
        organization_id:organizationId,
        job_id:jobId,
        status:'draft'
      })
      .select('id')
      .single();

    if (error || !estimate) {
      setMessage(error?.message || 'Unable to create estimate draft.');
      setBusy(false);
      return;
    }

    try {
      for (const file of photos) {
        const safeName=file.name.replace(/[^a-zA-Z0-9._-]/g,'_');
        const path=`${organizationId}/estimates/${estimate.id}/${crypto.randomUUID()}-${safeName}`;

        const { error:uploadError }=await supabase.storage
          .from('job-photos')
          .upload(path,file,{upsert:false,contentType:file.type});

        if (uploadError) throw uploadError;

        const { error:attachmentError }=await supabase.from('attachments').insert({
          organization_id:organizationId,
          job_id:jobId,
          estimate_id:estimate.id,
          storage_provider:'supabase',
          bucket:'job-photos',
          object_path:path,
          filename:file.name,
          mime_type:file.type || null,
          byte_size:file.size,
          attachment_type:'estimate_photo',
          customer_visible:false
        });

        if (attachmentError) throw attachmentError;
      }

      setMessage('Estimate draft created. Photos are attached and ready for scope/pricing work.');
      setPhotos([]);
    } catch (err) {
      setMessage('Estimate created, but photo upload failed: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }

    setBusy(false);
  }

  return <div>
    <p className="kicker">Estimate builder</p>
    <h1 className="page-title">Build an estimate</h1>
    <p className="subtitle">Start from a real job, attach site photos, then build labor, parts and materials.</p>

    <div className="quote-builder">
      <form className="card" onSubmit={saveDraft}>
        <h2 className="section-title">Estimate setup</h2>

        <label>
          <div className="secondary">Job</div>
          <select required value={jobId} onChange={e=>setJobId(e.target.value)} style={inputStyle}>
            <option value="">Select a job</option>
            {jobs.map(job=><option key={job.id} value={job.id}>{jobLabel(job)}</option>)}
          </select>
        </label>

        <label style={{display:'block',marginTop:14}}>
          <div className="secondary">Estimate photos</div>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            onChange={e=>setPhotos(Array.from(e.target.files ?? []))}
            style={inputStyle}
          />
          <div className="secondary">
            {photos.length ? `${photos.length} photo(s) selected` : 'Attach photos for condition, dimensions and AI-assisted estimating.'}
          </div>
        </label>

        <div className="actions" style={{marginTop:16}}>
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save estimate draft'}</button>
        </div>

        {message && <div className="secondary" style={{marginTop:14}}>{message}</div>}
      </form>

      <aside className="card">
        <p className="kicker">Next step</p>
        <h2 className="section-title">Scope & pricing</h2>
        <p className="secondary">
          Labor, parts, materials, assemblies, dimensions and photo-assisted suggestions will be added to this saved draft.
        </p>
      </aside>
    </div>
  </div>
}

const inputStyle={
  width:'100%',
  marginTop:6,
  padding:12,
  border:'1px solid #dfe4ea',
  borderRadius:10,
  fontSize:16,
  background:'white'
} as const;
