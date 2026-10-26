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
  const [organizationId,setOrganizationId] = useState<string | null>(null);
  const [jobs,setJobs] = useState<Job[]>([]);
  const [jobId,setJobId] = useState('');
  const [estimate,setEstimate] = useState<Estimate | null>(null);
  const [items,setItems] = useState<EstimateItem[]>([]);
  const [photos,setPhotos] = useState<File[]>([]);
  const [message,setMessage] = useState('');
  const [busy,setBusy] = useState(false);
  const [itemForm,setItemForm] = useState({...blankItem});

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

  async function recalcEstimate(estimateId:string,nextItems?:EstimateItem[]){
    const source=nextItems ?? items;
    const subtotal=source.reduce((sum,item)=>sum+(Number(item.quantity)*Number(item.unit_price)),0);

    const { error }=await supabase
      .from('estimates')
      .update({subtotal,tax:0,total:subtotal})
      .eq('id',estimateId);

    if (error) {
      setMessage(error.message);
      return;
    }

    setEstimate(prev=>prev ? {...prev,subtotal,tax:0,total:subtotal} : prev);
  }

  async function saveDraft(e:FormEvent){
    e.preventDefault();
    if (!organizationId || !jobId) return;

    setBusy(true);
    setMessage('');

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
      .select('id,job_id,status,subtotal,tax,total')
      .single();

    if (error || !estimateData) {
      setMessage(error?.message || 'Unable to create estimate draft.');
      setBusy(false);
      return;
    }

    try {
      for (const file of photos) {
        const safeName=file.name.replace(/[^a-zA-Z0-9._-]/g,'_');
        const path=`${organizationId}/estimates/${estimateData.id}/${crypto.randomUUID()}-${safeName}`;

        const { error:uploadError }=await supabase.storage
          .from('job-photos')
          .upload(path,file,{upsert:false,contentType:file.type});

        if (uploadError) throw uploadError;

        const { error:attachmentError }=await supabase.from('attachments').insert({
          organization_id:organizationId,
          job_id:jobId,
          estimate_id:estimateData.id,
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

      setEstimate(estimateData as Estimate);
      setPhotos([]);
      setItems([]);
      setMessage('Estimate draft created. Add labor, parts and materials below.');
    } catch (err) {
      setEstimate(estimateData as Estimate);
      setMessage('Estimate created, but photo upload failed: ' + (err instanceof Error ? err.message : 'Unknown error'));
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
    setMessage('');

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
      setMessage(error?.message || 'Unable to add estimate item.');
      setBusy(false);
      return;
    }

    const next=[...items,data as EstimateItem];
    setItems(next);
    setItemForm({...blankItem});
    await recalcEstimate(estimate.id,next);
    setBusy(false);
  }

  async function removeItem(itemId:string){
    if (!estimate) return;

    const { error }=await supabase
      .from('estimate_items')
      .delete()
      .eq('id',itemId);

    if (error) {
      setMessage(error.message);
      return;
    }

    const next=items.filter(item=>item.id!==itemId);
    setItems(next);
    await recalcEstimate(estimate.id,next);
  }

  async function resumeLatestDraft(){
    if (!organizationId || !jobId) return;

    setBusy(true);
    setMessage('');

    const { data,error }=await supabase
      .from('estimates')
      .select('id,job_id,status,subtotal,tax,total')
      .eq('organization_id',organizationId)
      .eq('job_id',jobId)
      .eq('status','draft')
      .order('created_at',{ascending:false})
      .limit(1);

    if (error) {
      setMessage(error.message);
      setBusy(false);
      return;
    }

    if (!data?.length) {
      setMessage('No draft estimate exists for this job yet.');
      setBusy(false);
      return;
    }

    setEstimate(data[0] as Estimate);
    await loadItems(data[0].id);
    setBusy(false);
  }

  const estimatedCost=items.reduce((sum,item)=>sum+(Number(item.quantity)*Number(item.unit_cost ?? 0)),0);
  const customerPrice=estimate?.total ?? 0;
  const margin=customerPrice-estimatedCost;

  return <div>
    <p className="kicker">Estimate builder</p>
    <h1 className="page-title">Build an estimate</h1>
    <p className="subtitle">Create the draft from a real job, then build structured labor, parts and materials.</p>

    {!estimate && <div className="quote-builder">
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
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Create new draft'}</button>
          <button className="btn btn-secondary" type="button" onClick={resumeLatestDraft} disabled={busy || !jobId}>Resume latest draft</button>
        </div>

        {message && <div className="secondary" style={{marginTop:14}}>{message}</div>}
      </form>

      <aside className="card">
        <p className="kicker">Workflow</p>
        <h2 className="section-title">Scope → price → invoice</h2>
        <p className="secondary">Once the draft exists, add labor, parts and materials. Internal cost stays separate from customer-facing pricing.</p>
      </aside>
    </div>}

    {estimate && <div className="quote-builder">
      <section className="card">
        <div className="group-head">
          <div>
            <p className="kicker">Draft estimate</p>
            <h2 className="section-title" style={{marginBottom:0}}>Line items</h2>
          </div>
          <button className="btn btn-secondary" type="button" onClick={()=>{setEstimate(null);setItems([]);setMessage('')}}>Choose another job</button>
        </div>

        <form onSubmit={addItem} className="grid grid-2" style={{marginTop:14}}>
          <label>
            <div className="secondary">Type</div>
            <select value={itemForm.item_type} onChange={e=>setItemForm({...itemForm,item_type:e.target.value as EstimateItem['item_type']})} style={inputStyle}>
              <option value="labor">Labor</option>
              <option value="part">Part</option>
              <option value="material">Material</option>
              <option value="other">Other</option>
            </select>
          </label>

          <label>
            <div className="secondary">Quantity</div>
            <input type="number" step="0.01" min="0.01" value={itemForm.quantity} onChange={e=>setItemForm({...itemForm,quantity:e.target.value})} style={inputStyle}/>
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
            <div className="secondary">Internal unit cost</div>
            <input type="number" step="0.01" min="0" value={itemForm.unit_cost} onChange={e=>setItemForm({...itemForm,unit_cost:e.target.value})} placeholder="Optional" style={inputStyle}/>
          </label>

          <label>
            <div className="secondary">Customer unit price</div>
            <input type="number" step="0.01" min="0" value={itemForm.unit_price} onChange={e=>setItemForm({...itemForm,unit_price:e.target.value})} required style={inputStyle}/>
          </label>

          <div className="actions" style={{gridColumn:'1 / -1'}}>
            <button className="btn btn-primary" disabled={busy}>+ Add line item</button>
          </div>
        </form>

        <div className="group" style={{marginTop:24}}>
          {items.length===0 && <div className="secondary">No line items yet.</div>}
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

        {message && <div className="secondary" style={{marginTop:14}}>{message}</div>}
      </section>

      <aside className="card">
        <p className="kicker">Customer price</p>
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

        <p className="secondary" style={{marginTop:14}}>Internal cost and margin are never included in the customer-facing estimate.</p>

        <div className="actions" style={{marginTop:18}}>
          <button className="btn btn-primary" type="button">Preview customer estimate</button>
          <button className="btn btn-secondary" type="button">Save draft</button>
        </div>
      </aside>
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
