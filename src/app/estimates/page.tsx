'use client';

import { DragEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react';
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

type Draft = {
  id:string;
  job_id:string;
  status:string;
  subtotal:number;
  tax:number;
  total:number;
  created_at:string;
  jobs?: {
    title:string;
    customers?: {
      first_name:string | null;
      last_name:string | null;
      company_name:string | null;
    } | null;
  } | null;
};

type EstimateItem = {
  id:string;
  item_type:'labor'|'part'|'material'|'other';
  customer_description:string | null;
  internal_description:string | null;
  quantity:number;
  unit_cost:number | null;
  unit_price:number;
  sort_order:number;
};

type Estimate = {
  id:string;
  job_id:string;
  status:string;
  subtotal:number;
  tax:number;
  total:number;
  created_at?:string;
};

const blankItem = {
  item_type:'labor' as EstimateItem['item_type'],
  customer_description:'',
  internal_description:'',
  quantity:'1',
  unit_cost:'',
  unit_price:''
};

export default function Estimates(){
  const supabase = useMemo(()=>createClient(),[]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [organizationId,setOrganizationId] = useState<string | null>(null);
  const [jobs,setJobs] = useState<Job[]>([]);
  const [drafts,setDrafts] = useState<Draft[]>([]);
  const [jobId,setJobId] = useState('');
  const [estimate,setEstimate] = useState<Estimate | null>(null);
  const [items,setItems] = useState<EstimateItem[]>([]);
  const [photos,setPhotos] = useState<File[]>([]);
  const [savedPhotoCount,setSavedPhotoCount] = useState(0);
  const [message,setMessage] = useState('');
  const [busy,setBusy] = useState(false);
  const [saveState,setSaveState] = useState<'idle'|'saving'|'saved'|'error'>('idle');
  const [itemForm,setItemForm] = useState({...blankItem});

  async function loadWorkspace(){
    setMessage('');
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

    const [jobResult,draftResult] = await Promise.all([
      supabase
        .from('jobs')
        .select('id,title,customer_id,customers(first_name,last_name,company_name)')
        .eq('organization_id',orgId)
        .order('created_at',{ascending:false}),
      supabase
        .from('estimates')
        .select('id,job_id,status,subtotal,tax,total,created_at,jobs(title,customers(first_name,last_name,company_name))')
        .eq('organization_id',orgId)
        .eq('status','draft')
        .order('created_at',{ascending:false})
    ]);

    if (jobResult.error) setMessage(jobResult.error.message);
    else setJobs((jobResult.data ?? []) as unknown as Job[]);

    if (draftResult.error) setMessage(draftResult.error.message);
    else setDrafts((draftResult.data ?? []) as unknown as Draft[]);
  }

  useEffect(()=>{void loadWorkspace();},[]);

  function customerName(customer?: {first_name:string|null;last_name:string|null;company_name:string|null} | null){
    return customer?.company_name || [customer?.first_name,customer?.last_name].filter(Boolean).join(' ') || 'Customer';
  }

  function jobLabel(job:Job){
    return customerName(job.customers) + ' — ' + job.title;
  }

  async function loadItems(estimateId:string){
    const { data,error }=await supabase
      .from('estimate_items')
      .select('id,item_type,customer_description,internal_description,quantity,unit_cost,unit_price,sort_order')
      .eq('estimate_id',estimateId)
      .order('sort_order',{ascending:true});

    if (error) {
      setMessage(error.message);
      return;
    }

    setItems((data ?? []) as EstimateItem[]);
  }

  async function loadPhotoCount(estimateId:string){
    const { count,error }=await supabase
      .from('attachments')
      .select('id',{count:'exact',head:true})
      .eq('estimate_id',estimateId);

    if (!error) setSavedPhotoCount(count ?? 0);
  }

  async function openDraft(draft:Draft){
    setEstimate({
      id:draft.id,
      job_id:draft.job_id,
      status:draft.status,
      subtotal:Number(draft.subtotal),
      tax:Number(draft.tax),
      total:Number(draft.total),
      created_at:draft.created_at
    });
    setJobId(draft.job_id);
    setPhotos([]);
    setMessage('');
    setSaveState('saved');
    await Promise.all([loadItems(draft.id),loadPhotoCount(draft.id)]);
  }

  async function recalcEstimate(estimateId:string,nextItems?:EstimateItem[]){
    const source=nextItems ?? items;
    const subtotal=source.reduce((sum,item)=>sum+(Number(item.quantity)*Number(item.unit_price)),0);

    const { error }=await supabase
      .from('estimates')
      .update({subtotal,tax:0,total:subtotal})
      .eq('id',estimateId);

    if (error) {
      setSaveState('error');
      setMessage(error.message);
      return;
    }

    setEstimate(prev=>prev ? {...prev,subtotal,tax:0,total:subtotal} : prev);
    setSaveState('saved');
    await loadWorkspace();
  }

  function addSelectedPhotos(files:File[]){
    const imageFiles=files.filter(file=>['image/jpeg','image/png','image/webp'].includes(file.type));
    setPhotos(prev=>[...prev,...imageFiles]);
  }

  function handleDrop(e:DragEvent<HTMLDivElement>){
    e.preventDefault();
    addSelectedPhotos(Array.from(e.dataTransfer.files));
  }

  async function uploadPhotos(estimateId:string){
    if (!organizationId || photos.length===0) return;

    for (const file of photos) {
      const safeName=file.name.replace(/[^a-zA-Z0-9._-]/g,'_');
      const path=`${organizationId}/estimates/${estimateId}/${crypto.randomUUID()}-${safeName}`;

      const { error:uploadError }=await supabase.storage
        .from('job-photos')
        .upload(path,file,{upsert:false,contentType:file.type});

      if (uploadError) throw uploadError;

      const { error:attachmentError }=await supabase.from('attachments').insert({
        organization_id:organizationId,
        job_id:jobId,
        estimate_id:estimateId,
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
  }

  async function saveDraft(e:FormEvent){
    e.preventDefault();
    if (!organizationId || !jobId) return;

    setBusy(true);
    setSaveState('saving');
    setMessage('Saving draft before uploading photos…');

    const { data:estimateData,error } = await supabase
      .from('estimates')
      .insert({
        organization_id:organizationId,
        job_id:jobId,
        status:'draft',
        subtotal:0,
        tax:0,
        total:0
      })
      .select('id,job_id,status,subtotal,tax,total,created_at')
      .single();

    if (error || !estimateData) {
      setSaveState('error');
      setMessage(error?.message || 'Unable to create estimate draft.');
      setBusy(false);
      return;
    }

    setEstimate(estimateData as Estimate);
    setItems([]);
    setSavedPhotoCount(0);
    setSaveState('saved');
    setMessage(`Draft saved. Uploading ${photos.length} photo(s)…`);

    try {
      await uploadPhotos(estimateData.id);
      setSavedPhotoCount(photos.length);
      setPhotos([]);
      setMessage('Draft saved. Photos uploaded. Next: add labor, parts and materials.');
      await loadWorkspace();
    } catch (err) {
      setMessage('Draft saved, but some photos failed to upload: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }

    setBusy(false);
  }

  async function addMorePhotos(){
    if (!estimate || photos.length===0) return;
    setBusy(true);
    setMessage(`Uploading ${photos.length} additional photo(s)…`);

    try {
      await uploadPhotos(estimate.id);
      setSavedPhotoCount(prev=>prev+photos.length);
      setPhotos([]);
      setMessage('Photos added to this saved draft.');
    } catch(err){
      setMessage(err instanceof Error ? err.message : 'Photo upload failed.');
    }

    setBusy(false);
  }

  async function addItem(e:FormEvent){
    e.preventDefault();
    if (!organizationId || !estimate) return;

    const quantity=Number(itemForm.quantity);
    const unitPrice=Number(itemForm.unit_price);
    const unitCost=itemForm.unit_cost.trim()==='' ? null : Number(itemForm.unit_cost);

    if (!itemForm.customer_description.trim() || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitPrice) || unitPrice < 0) {
      setMessage('Enter a description, quantity and valid customer price.');
      return;
    }

    setBusy(true);
    setSaveState('saving');
    setMessage('Saving line item…');

    const { data,error }=await supabase
      .from('estimate_items')
      .insert({
        organization_id:organizationId,
        estimate_id:estimate.id,
        item_type:itemForm.item_type,
        customer_description:itemForm.customer_description.trim(),
        internal_description:itemForm.internal_description.trim() || null,
        quantity,
        unit_cost:unitCost,
        unit_price:unitPrice,
        sort_order:items.length
      })
      .select('id,item_type,customer_description,internal_description,quantity,unit_cost,unit_price,sort_order')
      .single();

    if (error || !data) {
      setSaveState('error');
      setMessage(error?.message || 'Unable to add estimate item.');
      setBusy(false);
      return;
    }

    const next=[...items,data as EstimateItem];
    setItems(next);
    setItemForm({...blankItem});
    await recalcEstimate(estimate.id,next);
    setMessage('Line item saved.');
    setBusy(false);
  }

  async function removeItem(itemId:string){
    if (!estimate) return;

    setSaveState('saving');
    const { error }=await supabase
      .from('estimate_items')
      .delete()
      .eq('id',itemId);

    if (error) {
      setSaveState('error');
      setMessage(error.message);
      return;
    }

    const next=items.filter(item=>item.id!==itemId);
    setItems(next);
    await recalcEstimate(estimate.id,next);
    setMessage('Line item removed. Draft saved.');
  }

  const estimatedCost=items.reduce((sum,item)=>sum+(Number(item.quantity)*Number(item.unit_cost ?? 0)),0);
  const customerPrice=estimate?.total ?? 0;
  const margin=customerPrice-estimatedCost;

  return <div>
    <p className="kicker">Estimate builder</p>
    <h1 className="page-title">Estimates</h1>
    <p className="subtitle">Drafts save first. Photos and pricing are added to the saved draft.</p>

    {!estimate && <>
      {drafts.length>0 && <section className="card" style={{marginBottom:16}}>
        <div className="group-head">
          <div>
            <h2 className="section-title" style={{marginBottom:2}}>Saved drafts</h2>
            <div className="secondary">Open any draft and continue exactly where you left off.</div>
          </div>
          <span className="badge">{drafts.length} draft{drafts.length===1?'':'s'}</span>
        </div>

        <div className="list">
          {drafts.map(draft=><div className="list-item" key={draft.id}>
            <div>
              <div className="primary">{draft.jobs?.title || 'Untitled job'}</div>
              <div className="secondary">
                {customerName(draft.jobs?.customers)} · Saved {new Date(draft.created_at).toLocaleString()}
              </div>
            </div>
            <div className="actions">
              <div className="primary money">${Number(draft.total).toFixed(2)}</div>
              <button className="btn btn-primary" type="button" onClick={()=>openDraft(draft)}>Continue draft</button>
            </div>
          </div>)}
        </div>
      </section>}

      <div className="quote-builder">
        <form className="card" onSubmit={saveDraft}>
          <p className="kicker">Step 1</p>
          <h2 className="section-title">Start a saved draft</h2>
          <p className="secondary">Choose the job and add any site photos. The draft record is saved before photo uploads begin.</p>

          <label>
            <div className="secondary">Job</div>
            <select required value={jobId} onChange={e=>setJobId(e.target.value)} style={inputStyle}>
              <option value="">Select a job</option>
              {jobs.map(job=><option key={job.id} value={job.id}>{jobLabel(job)}</option>)}
            </select>
          </label>

          <div
            className="photo-dropzone"
            onDragOver={e=>e.preventDefault()}
            onDrop={handleDrop}
            onClick={()=>fileInputRef.current?.click()}
            style={{marginTop:14}}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              onChange={e=>addSelectedPhotos(Array.from(e.target.files ?? []))}
              style={{display:'none'}}
            />
            <div className="primary">Drag & drop photos here</div>
            <div className="secondary">or click to choose JPEG, PNG or WebP files</div>
            <div className="secondary" style={{marginTop:8}}>
              {photos.length ? `${photos.length} photo(s) ready to upload` : 'No photos selected yet'}
            </div>
          </div>

          <div className="actions" style={{marginTop:16}}>
            <button className="btn btn-primary" disabled={busy || !jobId}>{busy ? 'Saving…' : 'Save draft & continue'}</button>
          </div>

          {message && <div className="secondary" style={{marginTop:14}}>{message}</div>}
        </form>

        <aside className="card">
          <p className="kicker">What happens next</p>
          <h2 className="section-title">Then build the price</h2>
          <p className="secondary">After the draft is saved, you stay on that draft and add Labor, Parts and Materials. Leaving the page does not delete it.</p>
        </aside>
      </div>
    </>}

    {estimate && <div>
      <section className="card" style={{marginBottom:16}}>
        <div className="group-head">
          <div>
            <p className="kicker">Saved draft</p>
            <h2 className="section-title" style={{marginBottom:2}}>
              {jobs.find(j=>j.id===estimate.job_id)?.title || 'Estimate draft'}
            </h2>
            <div className="secondary">{savedPhotoCount} saved photo(s) · {items.length} line item(s)</div>
          </div>
          <div style={{textAlign:'right'}}>
            <span className={saveState==='error'?'badge warn':'badge success'}>
              {saveState==='saving'?'Saving…':saveState==='error'?'Save issue':'Draft saved'}
            </span>
            <div style={{marginTop:8}}>
              <button className="btn btn-secondary" type="button" onClick={()=>{setEstimate(null);setItems([]);setPhotos([]);setMessage('');void loadWorkspace();}}>Back to estimates</button>
            </div>
          </div>
        </div>

        {message && <div className="secondary" style={{marginTop:10}}>{message}</div>}
      </section>

      <div className="quote-builder">
        <section className="card">
          <p className="kicker">Step 2</p>
          <h2 className="section-title">Add labor, parts and materials</h2>
          <p className="secondary">Add one priced line at a time. Everything you add here is saved immediately to this draft.</p>

          <div className="actions" style={{marginBottom:14}}>
            {(['labor','part','material','other'] as EstimateItem['item_type'][]).map(type=>
              <button
                key={type}
                className={itemForm.item_type===type?'btn btn-primary':'btn btn-secondary'}
                type="button"
                onClick={()=>setItemForm({...itemForm,item_type:type})}
              >
                {type==='labor'?'Labor':type==='part'?'Part':type==='material'?'Material':'Other'}
              </button>
            )}
          </div>

          <form onSubmit={addItem} className="grid grid-2">
            <label>
              <div className="secondary">Quantity</div>
              <input type="number" step="0.01" min="0.01" value={itemForm.quantity} onChange={e=>setItemForm({...itemForm,quantity:e.target.value})} style={inputStyle}/>
            </label>

            <label>
              <div className="secondary">Customer unit price</div>
              <input type="number" step="0.01" min="0" value={itemForm.unit_price} onChange={e=>setItemForm({...itemForm,unit_price:e.target.value})} required style={inputStyle}/>
            </label>

            <label style={{gridColumn:'1 / -1'}}>
              <div className="secondary">Customer description</div>
              <input value={itemForm.customer_description} onChange={e=>setItemForm({...itemForm,customer_description:e.target.value})} placeholder="e.g. Clean, sand and stain deck surface" style={inputStyle}/>
            </label>

            <label style={{gridColumn:'1 / -1'}}>
              <div className="secondary">Internal note (not shown to customer)</div>
              <input value={itemForm.internal_description} onChange={e=>setItemForm({...itemForm,internal_description:e.target.value})} placeholder="Crew assumptions, prep notes, supplier detail…" style={inputStyle}/>
            </label>

            <label>
              <div className="secondary">Internal unit cost (optional)</div>
              <input type="number" step="0.01" min="0" value={itemForm.unit_cost} onChange={e=>setItemForm({...itemForm,unit_cost:e.target.value})} style={inputStyle}/>
            </label>

            <div className="actions" style={{alignItems:'end'}}>
              <button className="btn btn-primary" disabled={busy}>Save {itemForm.item_type}</button>
            </div>
          </form>

          <div className="group" style={{marginTop:24}}>
            {items.length===0 && <div className="secondary">No pricing lines yet. Start with the labor, part or material you want to quote first.</div>}
            {items.map(item=><div className="line-row" key={item.id}>
              <div>
                <div className="primary">{item.customer_description}</div>
                <div className="secondary">
                  {item.item_type} · {item.quantity} × ${Number(item.unit_price).toFixed(2)}
                  {item.internal_description ? ' · Internal: ' + item.internal_description : ''}
                </div>
              </div>
              <div style={{textAlign:'right'}}>
                <div className="primary money">${(Number(item.quantity)*Number(item.unit_price)).toFixed(2)}</div>
                <button type="button" className="btn btn-secondary" style={{marginTop:6,padding:'6px 9px'}} onClick={()=>removeItem(item.id)}>Remove</button>
              </div>
            </div>)}
          </div>
        </section>

        <aside>
          <section className="card">
            <p className="kicker">Draft total</p>
            <div className="metric-value money">${customerPrice.toFixed(2)}</div>

            <div className="list" style={{marginTop:18}}>
              <div className="list-item">
                <div className="secondary">Estimated internal cost</div>
                <div className="primary money">${estimatedCost.toFixed(2)}</div>
              </div>
              <div className="list-item">
                <div className="secondary">Estimated gross margin</div>
                <div className="primary money">${margin.toFixed(2)}</div>
              </div>
            </div>

            <p className="secondary" style={{marginTop:14}}>Internal cost and margin are never shown on the customer-facing estimate.</p>
          </section>

          <section className="card" style={{marginTop:16}}>
            <p className="kicker">Photos</p>
            <h2 className="section-title">Add more photos</h2>
            <div
              className="photo-dropzone"
              onDragOver={e=>e.preventDefault()}
              onDrop={handleDrop}
              onClick={()=>fileInputRef.current?.click()}
            >
              <div className="primary">Drag & drop or click</div>
              <div className="secondary">{photos.length ? `${photos.length} photo(s) ready` : 'Add more site photos anytime'}</div>
            </div>
            {photos.length>0 && <button className="btn btn-primary" style={{marginTop:12}} type="button" onClick={addMorePhotos} disabled={busy}>Upload selected photos</button>}
          </section>
        </aside>
      </div>
    </div>}
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
