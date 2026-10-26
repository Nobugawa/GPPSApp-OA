'use client';

import { DragEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '../../lib/supabase/client';

type Job = {
  id:string;
  title:string;
  scope:string | null;
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
  estimate_number:string | null;
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
  estimate_number:string | null;
  status:string;
  subtotal:number;
  tax:number;
  total:number;
  created_at?:string;
};

type ProposalLine = {
  type:'labor'|'material';
  description:string;
  quantity:number;
  unit:string;
  unitPrice:number;
  internalCost?:number | null;
};

type Proposal = {
  source:string;
  measurements:{
    deckAreaSqFt:number;
    railingLf:number;
    estimatedBalusterCount:number;
    totalTreadWidthFt:number;
    stairFinishAreaSqFt:number;
    estimatedDeckHeightFt:number;
    inferredDeckHeightFt:number;
    elevationSource:string;
    elevationClass:string;
    railingAccess:string;
    effectiveFinishAreaSqFt:number;
  };
  labor:{
    setupHours:number;
    cleaningHours:number;
    sandingHours:number;
    stainingHours:number;
    repairHours:number;
    totalHours:number;
    hourlyRate:number;
    visionAdjustmentHours?:number;
  };
  materials:{
    stainGallons:number;
    stainCostPerGallon:number;
    cleanerAllowance:number;
    sandingAllowance:number;
    miscAllowance:number;
  };
  lines:ProposalLine[];
  subtotal:number;
  assumptions:string[];
  flags:string[];
  vision?:{
    conditionSummary:string;
    repairRisk:string;
    photoFindings:string[];
  };
};

const blankItem = {
  item_type:'labor' as EstimateItem['item_type'],
  customer_description:'',
  internal_description:'',
  quantity:'1',
  unit_cost:'',
  unit_price:''
};

const blankEstimator = {
  lengthFt:'',
  widthFt:'',
  longRailSides:'1',
  shortRailSides:'2',
  stairOpeningFt:'3',
  railingMaterial:'wood' as 'wood'|'pvc'|'none',
  stairCount:'0',
  stairWidthFt:'3',
  deckHeightFt:'',
  terrainAccessNotes:'',
  railingAccess:'auto' as 'auto'|'topside'|'mixed'|'ladder',
  condition:'moderate' as 'light'|'moderate'|'heavy',
  repairHours:'0',
  coats:'2',
  laborRate:'120',
  stainCostPerGallon:'55'
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
  const [accessPhotos,setAccessPhotos] = useState<File[]>([]);
  const [savedPhotoCount,setSavedPhotoCount] = useState(0);
  const [message,setMessage] = useState('');
  const [busy,setBusy] = useState(false);
  const [saveState,setSaveState] = useState<'idle'|'saving'|'saved'|'error'>('idle');
  const [itemForm,setItemForm] = useState({...blankItem});
  const [estimatorForm,setEstimatorForm] = useState({...blankEstimator});
  const [proposal,setProposal] = useState<Proposal | null>(null);

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

    const [jobResult,draftResult,orgResult] = await Promise.all([
      supabase
        .from('jobs')
        .select('id,title,scope,customer_id,customers(first_name,last_name,company_name)')
        .eq('organization_id',orgId)
        .order('created_at',{ascending:false}),
      supabase
        .from('estimates')
        .select('id,job_id,estimate_number,status,subtotal,tax,total,created_at,jobs(title,customers(first_name,last_name,company_name))')
        .eq('organization_id',orgId)
        .eq('status','draft')
        .order('created_at',{ascending:false}),
      supabase
        .from('organizations')
        .select('default_labor_rate')
        .eq('id',orgId)
        .single()
    ]);

    if (jobResult.error) setMessage(jobResult.error.message);
    else setJobs((jobResult.data ?? []) as unknown as Job[]);

    if (draftResult.error) setMessage(draftResult.error.message);
    else setDrafts((draftResult.data ?? []) as unknown as Draft[]);

    if (!orgResult.error && orgResult.data?.default_labor_rate != null) {
      setEstimatorForm(prev=>({...prev,laborRate:String(orgResult.data.default_labor_rate)}));
    }
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

  async function loadSavedEstimator(estimateId:string){
    const { data,error }=await supabase
      .from('estimates')
      .select('estimator_input,estimator_output')
      .eq('id',estimateId)
      .single();

    if (error || !data) return;

    const input=data.estimator_input as Record<string,unknown> | null;
    const output=data.estimator_output as Proposal | null;

    if (input && Object.keys(input).length) {
      setEstimatorForm(prev=>({
        ...prev,
        lengthFt:String(input.lengthFt ?? prev.lengthFt),
        widthFt:String(input.widthFt ?? prev.widthFt),
        longRailSides:String(input.longRailSides ?? prev.longRailSides),
        shortRailSides:String(input.shortRailSides ?? prev.shortRailSides),
        stairOpeningFt:String(input.stairOpeningFt ?? prev.stairOpeningFt),
        railingMaterial:(input.railingMaterial as 'wood'|'pvc'|'none') ?? prev.railingMaterial,
        stairCount:String(input.stairCount ?? prev.stairCount),
        stairWidthFt:String(input.stairWidthFt ?? prev.stairWidthFt),
        deckHeightFt:input.deckHeightFt===null || input.deckHeightFt===undefined ? prev.deckHeightFt : String(input.deckHeightFt),
        terrainAccessNotes:String(input.terrainAccessNotes ?? prev.terrainAccessNotes),
        railingAccess:(input.railingAccess as 'auto'|'topside'|'mixed'|'ladder') ?? prev.railingAccess,
        condition:(input.condition as 'light'|'moderate'|'heavy') ?? prev.condition,
        repairHours:String(input.repairHours ?? prev.repairHours),
        coats:String(input.coats ?? prev.coats),
        laborRate:String(input.laborRate ?? prev.laborRate),
        stainCostPerGallon:String(input.stainCostPerGallon ?? prev.stainCostPerGallon)
      }));
    }

    if (output && Object.keys(output).length) {
      const legacyMeasurements = (output.measurements ?? {}) as Partial<Proposal['measurements']>;
      const normalizedProposal:Proposal = {
        ...output,
        measurements:{
          deckAreaSqFt:Number(legacyMeasurements.deckAreaSqFt ?? 0),
          railingLf:Number(legacyMeasurements.railingLf ?? 0),
          estimatedBalusterCount:Number(legacyMeasurements.estimatedBalusterCount ?? 0),
          totalTreadWidthFt:Number(legacyMeasurements.totalTreadWidthFt ?? 0),
          stairFinishAreaSqFt:Number(legacyMeasurements.stairFinishAreaSqFt ?? 0),
          estimatedDeckHeightFt:Number(legacyMeasurements.estimatedDeckHeightFt ?? legacyMeasurements.inferredDeckHeightFt ?? 0),
          inferredDeckHeightFt:Number(legacyMeasurements.inferredDeckHeightFt ?? legacyMeasurements.estimatedDeckHeightFt ?? 0),
          elevationSource:String(legacyMeasurements.elevationSource ?? 'legacy'),
          elevationClass:String(legacyMeasurements.elevationClass ?? 'unknown'),
          railingAccess:String(legacyMeasurements.railingAccess ?? 'unknown'),
          effectiveFinishAreaSqFt:Number(legacyMeasurements.effectiveFinishAreaSqFt ?? legacyMeasurements.deckAreaSqFt ?? 0)
        }
      };
      setProposal(normalizedProposal);
    }
  }

  async function openDraft(draft:Draft){
    setEstimate({
      id:draft.id,
      job_id:draft.job_id,
      estimate_number:draft.estimate_number,
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
    setProposal(null);
    await Promise.all([loadItems(draft.id),loadPhotoCount(draft.id),loadSavedEstimator(draft.id)]);
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
      .select('id,job_id,estimate_number,status,subtotal,tax,total,created_at')
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
    setProposal(null);
    setSaveState('saved');
    setMessage(`Draft saved. Uploading ${photos.length} photo(s)…`);

    try {
      await uploadPhotos(estimateData.id);
      setSavedPhotoCount(photos.length);
      setPhotos([]);
      setMessage('Draft saved. Photos uploaded. Next: generate a proposal or add line items manually.');
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

  async function getEstimatePhotoUrls(){
    if (!estimate) return [] as string[];

    const { data,error }=await supabase
      .from('attachments')
      .select('bucket,object_path,mime_type')
      .eq('estimate_id',estimate.id)
      .order('created_at',{ascending:true});

    if (error || !data) return [] as string[];

    const imageRows=data.filter(row=>row.object_path && (!row.mime_type || row.mime_type.startsWith('image/')));
    const signed=await Promise.all(imageRows.map(async row=>{
      const { data:signedData }=await supabase.storage
        .from(row.bucket || 'job-photos')
        .createSignedUrl(row.object_path,900);
      return signedData?.signedUrl ?? null;
    }));

    return signed.filter(Boolean) as string[];
  }

  async function generateProposal(){
    if (!estimate) return;

    const lengthFt=Number(estimatorForm.lengthFt);
    const widthFt=Number(estimatorForm.widthFt);

    if (!Number.isFinite(lengthFt) || lengthFt<=0 || !Number.isFinite(widthFt) || widthFt<=0) {
      setMessage('Enter the deck length and width before generating a proposal.');
      return;
    }

    setBusy(true);
    setMessage('Generating proposal from measurements, condition and saved photos…');

    const photoUrls=await getEstimatePhotoUrls();
    const job=jobs.find(j=>j.id===estimate.job_id);

    const input={
      lengthFt,
      widthFt,
      longRailSides:Number(estimatorForm.longRailSides || 0),
      shortRailSides:Number(estimatorForm.shortRailSides || 0),
      stairOpeningFt:Number(estimatorForm.stairOpeningFt || 0),
      railingMaterial:estimatorForm.railingMaterial,
      stairCount:Number(estimatorForm.stairCount || 0),
      stairWidthFt:Number(estimatorForm.stairWidthFt || 0),
      deckHeightFt:estimatorForm.deckHeightFt.trim()==='' ? null : Number(estimatorForm.deckHeightFt),
      terrainAccessNotes:estimatorForm.terrainAccessNotes,
      railingAccess:estimatorForm.railingAccess,
      condition:estimatorForm.condition,
      repairHours:Number(estimatorForm.repairHours || 0),
      coats:Number(estimatorForm.coats || 2),
      laborRate:Number(estimatorForm.laborRate || 120),
      stainCostPerGallon:Number(estimatorForm.stainCostPerGallon || 55),
      scopeText:job?.scope || job?.title || '',
      photoUrls
    };

    try {
      const response=await fetch('/api/estimator/deck',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify(input)
      });

      const data=await response.json();
      if (!response.ok) throw new Error(data.error || 'Estimator failed.');

      const nextProposal=data as Proposal;
      setProposal(nextProposal);

      const { error:saveError }=await supabase
        .from('estimates')
        .update({
          estimator_input:input,
          estimator_output:nextProposal
        })
        .eq('id',estimate.id);

      if (saveError) throw saveError;

      setMessage(nextProposal.source==='deterministic+vision'
        ? 'Proposal generated using measurements plus photo analysis. Review before applying.'
        : 'Proposal generated from structured measurements. Photo analysis will enrich it when the AI API key is connected.');
    } catch(err){
      setMessage(err instanceof Error ? err.message : 'Unable to generate proposal.');
    }

    setBusy(false);
  }

  async function applyProposal(){
    if (!organizationId || !estimate || !proposal) return;

    if (items.length>0) {
      setMessage('This estimate already has line items. Remove them first or keep adjusting manually before applying a generated proposal.');
      return;
    }

    setBusy(true);
    setSaveState('saving');
    setMessage('Applying proposal to Estimate #' + (estimate.estimate_number ?? '') + '…');

    const { data,error }=await supabase
      .from('estimate_items')
      .insert(proposal.lines.map((line,index)=>({
        organization_id:organizationId,
        estimate_id:estimate.id,
        item_type:line.type,
        customer_description:line.description,
        internal_description:`Estimator proposal · unit: ${line.unit} · source: ${proposal.source}`,
        quantity:line.quantity,
        unit_cost:line.internalCost ?? null,
        unit_price:line.unitPrice,
        sort_order:index
      })))
      .select('id,item_type,customer_description,internal_description,quantity,unit_cost,unit_price,sort_order');

    if (error || !data) {
      setSaveState('error');
      setMessage(error?.message || 'Unable to apply proposal.');
      setBusy(false);
      return;
    }

    const next=data as EstimateItem[];
    setItems(next);
    await recalcEstimate(estimate.id,next);
    setSaveState('saved');
    setMessage('Proposal applied. Review the line items and adjust anything before sending to the customer.');
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
    <p className="subtitle">Drafts save first. Generate a proposal from measurements and photos, then review before sending.</p>

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
              <div className="primary">Estimate #{draft.estimate_number ?? '—'} · {draft.jobs?.title || 'Untitled job'}</div>
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

          <div className="photo-dropzone" onDragOver={e=>e.preventDefault()} onDrop={handleDrop} onClick={()=>fileInputRef.current?.click()} style={{marginTop:14}}>
            <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={e=>addSelectedPhotos(Array.from(e.target.files ?? []))} style={{display:'none'}} />
            <div className="primary">Drag & drop photos here</div>
            <div className="secondary">or click to choose JPEG, PNG or WebP files</div>
            <div className="secondary" style={{marginTop:8}}>{photos.length ? `${photos.length} photo(s) ready to upload` : 'No photos selected yet'}</div>
          </div>

          <div className="actions" style={{marginTop:16}}>
            <button className="btn btn-primary" disabled={busy || !jobId}>{busy ? 'Saving…' : 'Save draft & continue'}</button>
          </div>

          {message && <div className="secondary" style={{marginTop:14}}>{message}</div>}
        </form>

        <aside className="card">
          <p className="kicker">What happens next</p>
          <h2 className="section-title">Generate, then review</h2>
          <p className="secondary">The estimator proposes labor and materials from measurements, condition and available photos. You approve or adjust it before anything becomes customer-facing.</p>
        </aside>
      </div>
    </>}

    {estimate && <div>
      <section className="card" style={{marginBottom:16}}>
        <div className="group-head">
          <div>
            <p className="kicker">Saved draft</p>
            <h2 className="section-title" style={{marginBottom:2}}>Estimate #{estimate.estimate_number ?? '—'} · {jobs.find(j=>j.id===estimate.job_id)?.title || 'Estimate draft'}</h2>
            <div className="secondary">{savedPhotoCount} saved photo(s) · {items.length} line item(s)</div>
          </div>
          <div style={{textAlign:'right'}}>
            <span className={saveState==='error'?'badge warn':'badge success'}>{saveState==='saving'?'Saving…':saveState==='error'?'Save issue':'Draft saved'}</span>
            <div style={{marginTop:8}}><button className="btn btn-secondary" type="button" onClick={()=>{setEstimate(null);setItems([]);setPhotos([]);setAccessPhotos([]);setProposal(null);setMessage('');void loadWorkspace();}}>Back to estimates</button></div>
          </div>
        </div>
        {message && <div className="secondary" style={{marginTop:10}}>{message}</div>}
      </section>

      <section className="card" style={{marginBottom:16}}>
        <p className="kicker">Step 2</p>
        <h2 className="section-title">Generate deck proposal</h2>
        <p className="secondary">Enter the measurements you know. Photos and the job scope provide context; you do not need to write a long description.</p>

        <div className="grid grid-2">
          <label><div className="secondary">Deck length (ft)</div><input type="number" min="0" step="0.1" value={estimatorForm.lengthFt} onChange={e=>setEstimatorForm({...estimatorForm,lengthFt:e.target.value})} style={inputStyle}/></label>
          <label><div className="secondary">Deck width (ft)</div><input type="number" min="0" step="0.1" value={estimatorForm.widthFt} onChange={e=>setEstimatorForm({...estimatorForm,widthFt:e.target.value})} style={inputStyle}/></label>
          <label><div className="secondary">Railed long sides</div>
            <select value={estimatorForm.longRailSides} onChange={e=>setEstimatorForm({...estimatorForm,longRailSides:e.target.value})} style={inputStyle}>
              <option value="0">0</option><option value="1">1</option><option value="2">2</option>
            </select>
          </label>
          <label><div className="secondary">Railed short sides</div>
            <select value={estimatorForm.shortRailSides} onChange={e=>setEstimatorForm({...estimatorForm,shortRailSides:e.target.value})} style={inputStyle}>
              <option value="0">0</option><option value="1">1</option><option value="2">2</option>
            </select>
          </label>
          <label><div className="secondary">Stair opening in railing (ft)</div><input type="number" min="0" step="0.5" value={estimatorForm.stairOpeningFt} onChange={e=>setEstimatorForm({...estimatorForm,stairOpeningFt:e.target.value})} style={inputStyle}/></label>
          <label><div className="secondary">Railing / baluster material</div>
            <select value={estimatorForm.railingMaterial} onChange={e=>setEstimatorForm({...estimatorForm,railingMaterial:e.target.value as 'wood'|'pvc'|'none'})} style={inputStyle}>
              <option value="wood">Wood — clean/sand/stain</option>
              <option value="pvc">PVC/composite — clean only</option>
              <option value="none">No railing</option>
            </select>
          </label>
          <label><div className="secondary">Number of stair treads</div><input type="number" min="0" step="1" value={estimatorForm.stairCount} onChange={e=>setEstimatorForm({...estimatorForm,stairCount:e.target.value})} style={inputStyle}/></label>
          <label><div className="secondary">Width of each tread (ft)</div><input type="number" min="0" step="0.25" value={estimatorForm.stairWidthFt} onChange={e=>setEstimatorForm({...estimatorForm,stairWidthFt:e.target.value})} style={inputStyle}/></label>
          <label>
            <div className="secondary">Deck height above grade (ft) — optional override</div>
            <input type="number" min="0" step="0.5" value={estimatorForm.deckHeightFt} onChange={e=>setEstimatorForm({...estimatorForm,deckHeightFt:e.target.value})} placeholder="Leave blank to infer from stairs" style={inputStyle}/>
            <div className="secondary">Measure from the finished deck walking surface down to the grade directly below the work area.</div>
          </label>
          <label><div className="secondary">Exterior railing access</div>
            <select value={estimatorForm.railingAccess} onChange={e=>setEstimatorForm({...estimatorForm,railingAccess:e.target.value as 'auto'|'topside'|'mixed'|'ladder'})} style={inputStyle}>
              <option value="auto">Auto from stairs/elevation</option>
              <option value="topside">Reachable from deck/topside</option>
              <option value="mixed">Some exterior/ladder access</option>
              <option value="ladder">Mostly ladder/exterior access</option>
            </select>
          </label>
          <label style={{gridColumn:'1 / -1'}}>
            <div className="secondary">Site access / terrain notes</div>
            <textarea
              rows={3}
              value={estimatorForm.terrainAccessNotes}
              onChange={e=>setEstimatorForm({...estimatorForm,terrainAccessNotes:e.target.value})}
              placeholder="Example: steep slope below rear rail; shrubs along left side; retaining wall near ladder setup; narrow side-yard access."
              style={{...inputStyle,resize:'vertical'}}
            />
          </label>
          <div style={{gridColumn:'1 / -1'}}>
            <div className="secondary">Site access / terrain photos</div>
            <div className="photo-dropzone" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();setAccessPhotos(prev=>[...prev,...Array.from(e.dataTransfer.files).filter(file=>['image/jpeg','image/png','image/webp'].includes(file.type))])}}>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                onChange={e=>setAccessPhotos(prev=>[...prev,...Array.from(e.target.files ?? [])])}
                style={{width:'100%'}}
              />
              <div className="secondary" style={{marginTop:6}}>
                {accessPhotos.length ? `${accessPhotos.length} access/terrain photo(s) selected` : 'Use photos to show slopes, plants, walls, fences, ladder footing, or restricted access.'}
              </div>
            </div>
            {accessPhotos.length>0 && <button
              className="btn btn-secondary"
              type="button"
              style={{marginTop:8}}
              disabled={busy}
              onClick={async ()=>{
                if(!estimate || !organizationId) return;
                setBusy(true);
                setMessage(`Uploading ${accessPhotos.length} site-access photo(s)…`);
                try{
                  for(const file of accessPhotos){
                    const safeName=file.name.replace(/[^a-zA-Z0-9._-]/g,'_');
                    const path=`${organizationId}/estimates/${estimate.id}/access/${crypto.randomUUID()}-${safeName}`;
                    const {error:uploadError}=await supabase.storage.from('job-photos').upload(path,file,{upsert:false,contentType:file.type});
                    if(uploadError) throw uploadError;
                    const {error:attachmentError}=await supabase.from('attachments').insert({
                      organization_id:organizationId,
                      job_id:estimate.job_id,
                      estimate_id:estimate.id,
                      storage_provider:'supabase',
                      bucket:'job-photos',
                      object_path:path,
                      filename:file.name,
                      mime_type:file.type||null,
                      byte_size:file.size,
                      attachment_type:'site_access_photo',
                      customer_visible:false
                    });
                    if(attachmentError) throw attachmentError;
                  }
                  setSavedPhotoCount(prev=>prev+accessPhotos.length);
                  setAccessPhotos([]);
                  setMessage('Site access / terrain photos saved to this estimate.');
                }catch(err){
                  setMessage(err instanceof Error ? err.message : 'Site access photo upload failed.');
                }
                setBusy(false);
              }}
            >Upload access photos</button>}
          </div>
          <label><div className="secondary">Surface condition</div>
            <select value={estimatorForm.condition} onChange={e=>setEstimatorForm({...estimatorForm,condition:e.target.value as 'light'|'moderate'|'heavy'})} style={inputStyle}>
              <option value="light">Light prep</option><option value="moderate">Moderate prep</option><option value="heavy">Heavy prep</option>
            </select>
          </label>
          <label><div className="secondary">Repair labor allowance (hours)</div><input type="number" min="0" step="0.25" value={estimatorForm.repairHours} onChange={e=>setEstimatorForm({...estimatorForm,repairHours:e.target.value})} style={inputStyle}/></label>
          <label><div className="secondary">Number of stain coats</div><input type="number" min="1" max="4" step="1" value={estimatorForm.coats} onChange={e=>setEstimatorForm({...estimatorForm,coats:e.target.value})} style={inputStyle}/></label>
          <label><div className="secondary">GPPS hourly labor rate</div><input type="number" min="0" step="1" value={estimatorForm.laborRate} onChange={e=>setEstimatorForm({...estimatorForm,laborRate:e.target.value})} style={inputStyle}/></label>
          <label><div className="secondary">Stain cost per gallon</div><input type="number" min="0" step="1" value={estimatorForm.stainCostPerGallon} onChange={e=>setEstimatorForm({...estimatorForm,stainCostPerGallon:e.target.value})} style={inputStyle}/></label>
        </div>

        <div className="actions" style={{marginTop:16}}>
          <button className="btn btn-primary" type="button" onClick={generateProposal} disabled={busy}>{busy?'Generating…':'Generate proposal'}</button>
        </div>

        {proposal && <div className="card" style={{marginTop:16,boxShadow:'none'}}>
          <div className="group-head">
            <div>
              <h3 className="section-title" style={{marginBottom:2}}>Proposed estimate</h3>
              <div className="secondary">{proposal.source==='deterministic+vision'?'Measurements + photo analysis':'Measurements + estimating model'} · {Number(proposal.measurements.deckAreaSqFt ?? 0).toFixed(0)} sq ft deck · {Number(proposal.measurements.railingLf ?? 0).toFixed(0)} LF railing · {Number(proposal.measurements.totalTreadWidthFt ?? 0).toFixed(0)} ft cumulative tread width · ~{Number(proposal.measurements.estimatedDeckHeightFt ?? 0).toFixed(1)} ft high ({proposal.measurements.elevationClass}, {proposal.measurements.elevationSource==='manual'?'manual':'inferred'})</div>
            </div>
            <div className="metric-value money">${proposal.subtotal.toFixed(2)}</div>
          </div>

          <div className="grid grid-2" style={{marginTop:12}}>
            <div className="card" style={{boxShadow:'none'}}>
              <div className="secondary">Proposed labor</div>
              <div className="primary">{proposal.labor.totalHours.toFixed(2)} hr × ${proposal.labor.hourlyRate.toFixed(2)}/hr</div>
              <div className="secondary">Clean {proposal.labor.cleaningHours} · Sand {proposal.labor.sandingHours} · Stain {proposal.labor.stainingHours} · Repair {proposal.labor.repairHours}</div>
            </div>
            <div className="card" style={{boxShadow:'none'}}>
              <div className="secondary">Proposed stain</div>
              <div className="primary">{proposal.materials.stainGallons} gallon(s)</div>
              <div className="secondary">{estimatorForm.coats} coat(s) plus planning waste{proposal.measurements.estimatedBalusterCount ? ` · ~${proposal.measurements.estimatedBalusterCount} balusters included` : ''}</div>
            </div>
          </div>

          {proposal.vision?.conditionSummary && <div style={{marginTop:14}}><strong>Photo assessment</strong><div className="secondary">{proposal.vision.conditionSummary}</div></div>}

          {proposal.flags.length>0 && <div style={{marginTop:14}}><strong>Review flags</strong><ul>{proposal.flags.map((flag,i)=><li key={i} className="secondary">{flag}</li>)}</ul></div>}

          <div style={{marginTop:14}}><strong>Proposed customer lines</strong>
            <div className="list">
              {proposal.lines.map((line,i)=><div className="list-item" key={i}>
                <div><div className="primary">{line.description}</div><div className="secondary">{line.quantity} {line.unit} × ${line.unitPrice.toFixed(2)}</div></div>
                <div className="primary money">${(line.quantity*line.unitPrice).toFixed(2)}</div>
              </div>)}
            </div>
          </div>

          <div className="actions" style={{marginTop:16}}>
            <button className="btn btn-primary" type="button" onClick={applyProposal} disabled={busy || items.length>0}>Apply proposal to estimate</button>
            {items.length>0 && <span className="secondary">Remove existing manual lines before applying a generated proposal.</span>}
          </div>
        </div>}
      </section>

      <div className="quote-builder">
        <section className="card">
          <p className="kicker">Step 3</p>
          <h2 className="section-title">Review the applied estimate</h2>
          <p className="secondary">Step 2 creates a proposal only. When you click “Apply proposal to estimate,” those proposed lines become the saved estimate here. Step 3 is simply where you fine-tune them, remove anything you do not want, or add a missing labor/part/material line before sending it to the customer.</p>

          <div className="actions" style={{marginBottom:14}}>
            {(['labor','part','material','other'] as EstimateItem['item_type'][]).map(type=><button key={type} className={itemForm.item_type===type?'btn btn-primary':'btn btn-secondary'} type="button" onClick={()=>setItemForm({...itemForm,item_type:type})}>{type==='labor'?'Labor':type==='part'?'Part':type==='material'?'Material':'Other'}</button>)}
          </div>

          <form onSubmit={addItem} className="grid grid-2">
            <label><div className="secondary">{itemForm.item_type==='labor' ? 'Hours' : 'Quantity'}</div><input type="number" step="0.01" min="0.01" value={itemForm.quantity} onChange={e=>setItemForm({...itemForm,quantity:e.target.value})} style={inputStyle}/></label>
            <label><div className="secondary">{itemForm.item_type==='labor' ? 'Hourly rate charged to customer' : 'Price per unit charged to customer'}</div><input type="number" step="0.01" min="0" value={itemForm.unit_price} onChange={e=>setItemForm({...itemForm,unit_price:e.target.value})} required style={inputStyle}/></label>
            <label style={{gridColumn:'1 / -1'}}><div className="secondary">Customer-facing description</div><input value={itemForm.customer_description} onChange={e=>setItemForm({...itemForm,customer_description:e.target.value})} placeholder="e.g. Clean, sand and stain deck surface" style={inputStyle}/></label>
            <label style={{gridColumn:'1 / -1'}}><div className="secondary">Internal note (not shown to customer)</div><input value={itemForm.internal_description} onChange={e=>setItemForm({...itemForm,internal_description:e.target.value})} placeholder="Crew assumptions, prep notes, supplier detail…" style={inputStyle}/></label>
            <label><div className="secondary">{itemForm.item_type==='labor' ? 'Internal labor cost per hour (optional)' : 'Internal cost per unit (optional)'}</div><input type="number" step="0.01" min="0" value={itemForm.unit_cost} onChange={e=>setItemForm({...itemForm,unit_cost:e.target.value})} style={inputStyle}/></label>
            <div className="actions" style={{alignItems:'end'}}><button className="btn btn-primary" disabled={busy}>Save {itemForm.item_type}</button></div>
          </form>

          <div className="group" style={{marginTop:24}}>
            {items.length===0 && <div className="secondary">No pricing lines yet. Generate a proposal above or add a line manually.</div>}
            {items.map(item=><div className="line-row" key={item.id}>
              <div><div className="primary">{item.customer_description}</div><div className="secondary">{item.item_type} · {item.quantity} × ${Number(item.unit_price).toFixed(2)}{item.internal_description ? ' · Internal: ' + item.internal_description : ''}</div></div>
              <div style={{textAlign:'right'}}><div className="primary money">${(Number(item.quantity)*Number(item.unit_price)).toFixed(2)}</div><button type="button" className="btn btn-secondary" style={{marginTop:6,padding:'6px 9px'}} onClick={()=>removeItem(item.id)}>Remove</button></div>
            </div>)}
          </div>
        </section>

        <aside>
          <section className="card">
            <p className="kicker">Draft total</p>
            <div className="metric-value money">${customerPrice.toFixed(2)}</div>
            <div className="list" style={{marginTop:18}}>
              <div className="list-item"><div className="secondary">Estimated internal cost</div><div className="primary money">${estimatedCost.toFixed(2)}</div></div>
              <div className="list-item"><div className="secondary">Estimated gross margin</div><div className="primary money">${margin.toFixed(2)}</div></div>
            </div>
            <p className="secondary" style={{marginTop:14}}>Internal cost and margin are never shown on the customer-facing estimate.</p>
          </section>

          <section className="card" style={{marginTop:16}}>
            <p className="kicker">Photos</p>
            <h2 className="section-title">Add more photos</h2>
            <div className="photo-dropzone" onDragOver={e=>e.preventDefault()} onDrop={handleDrop} onClick={()=>fileInputRef.current?.click()}>
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
