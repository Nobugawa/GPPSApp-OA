'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '../../lib/supabase/client';

type EstimateChoice = {
  id:string;
  job_id:string;
  total:number;
  status:string;
  jobs?: {
    title:string;
    customer_id:string;
    customers?: {
      id:string;
      first_name:string | null;
      last_name:string | null;
      company_name:string | null;
      email:string | null;
      stripe_customer_id:string | null;
    } | null;
  } | null;
};

type InvoiceRow = {
  id:string;
  invoice_number:string | null;
  status:string;
  stripe_invoice_id:string | null;
  stripe_status:string | null;
  hosted_invoice_url:string | null;
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

export default function Invoices(){
  const supabase=useMemo(()=>createClient(),[]);
  const [organizationId,setOrganizationId]=useState<string | null>(null);
  const [estimates,setEstimates]=useState<EstimateChoice[]>([]);
  const [invoices,setInvoices]=useState<InvoiceRow[]>([]);
  const [showCreate,setShowCreate]=useState(false);
  const [estimateId,setEstimateId]=useState('');
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);

  async function load(){
    setMessage('');
    const { data:userData }=await supabase.auth.getUser();
    if(!userData.user) return;

    const { data:membership,error:memberError }=await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id',userData.user.id)
      .limit(1);

    if(memberError){setMessage(memberError.message);return;}
    const orgId=membership?.[0]?.organization_id ?? null;
    setOrganizationId(orgId);
    if(!orgId) return;

    const [estimateResult,invoiceResult]=await Promise.all([
      supabase
        .from('estimates')
        .select('id,job_id,total,status,jobs(title,customer_id,customers(id,first_name,last_name,company_name,email,stripe_customer_id))')
        .eq('organization_id',orgId)
        .order('created_at',{ascending:false}),
      supabase
        .from('invoices')
        .select('id,invoice_number,status,stripe_invoice_id,stripe_status,hosted_invoice_url,total,created_at,jobs(title,customers(first_name,last_name,company_name))')
        .eq('organization_id',orgId)
        .order('created_at',{ascending:false})
    ]);

    if(estimateResult.error){setMessage(estimateResult.error.message);return;}
    if(invoiceResult.error){setMessage(invoiceResult.error.message);return;}

    setEstimates((estimateResult.data ?? []) as unknown as EstimateChoice[]);
    setInvoices((invoiceResult.data ?? []) as unknown as InvoiceRow[]);
  }

  useEffect(()=>{void load();},[]);

  function customerName(customer:EstimateChoice['jobs'] extends infer J ? any : never){
    return customer?.company_name || [customer?.first_name,customer?.last_name].filter(Boolean).join(' ') || 'Customer';
  }

  async function createInvoice(){
    if(!organizationId || !estimateId) return;
    const estimate=estimates.find(e=>e.id===estimateId);
    if(!estimate || !estimate.jobs?.customers){
      setMessage('Select a valid estimate with a customer.');
      return;
    }

    setBusy(true);
    setMessage('');

    const { data:estimateItems,error:itemError }=await supabase
      .from('estimate_items')
      .select('component_id,item_type,internal_description,customer_description,quantity,unit_cost,unit_price,sort_order')
      .eq('estimate_id',estimate.id)
      .order('sort_order');

    if(itemError){
      setMessage(itemError.message);
      setBusy(false);
      return;
    }

    if(!estimateItems?.length){
      setMessage('That estimate has no line items. Add estimate items before invoicing.');
      setBusy(false);
      return;
    }

    const subtotal=estimateItems.reduce((sum,item)=>sum+(Number(item.quantity)*Number(item.unit_price)),0);

    const { data:invoice,error:invoiceError }=await supabase
      .from('invoices')
      .insert({
        organization_id:organizationId,
        job_id:estimate.job_id,
        estimate_id:estimate.id,
        status:'draft',
        subtotal,
        tax:0,
        total:subtotal
      })
      .select('id')
      .single();

    if(invoiceError || !invoice){
      setMessage(invoiceError?.message || 'Unable to create invoice.');
      setBusy(false);
      return;
    }

    const { error:copyError }=await supabase.from('invoice_items').insert(
      estimateItems.map(item=>({
        organization_id:organizationId,
        invoice_id:invoice.id,
        component_id:item.component_id,
        item_type:item.item_type,
        internal_description:item.internal_description,
        customer_description:item.customer_description,
        quantity:item.quantity,
        unit_cost:item.unit_cost,
        unit_price:item.unit_price,
        sort_order:item.sort_order
      }))
    );

    if(copyError){
      setMessage('Invoice created, but line items failed to copy: '+copyError.message);
      setBusy(false);
      await load();
      return;
    }

    const customer=estimate.jobs.customers;
    const name=customerName(customer);

    try {
      const response=await fetch('/api/stripe/create-invoice',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          stripeCustomerId:customer.stripe_customer_id,
          customerName:name,
          customerEmail:customer.email,
          daysUntilDue:7,
          items:estimateItems.map(item=>({
            description:item.customer_description || 'Service',
            amountCents:Math.round(Number(item.quantity)*Number(item.unit_price)*100)
          }))
        })
      });

      const stripeData=await response.json();

      if(!response.ok){
        await supabase.from('invoices').update({
          status:'draft',
          stripe_status:'not_connected'
        }).eq('id',invoice.id);

        setMessage('GPPS invoice created. Stripe was not created: '+(stripeData.error || 'Stripe is unavailable.'));
      } else {
        if(!customer.stripe_customer_id && stripeData.stripeCustomerId){
          await supabase.from('customers').update({
            stripe_customer_id:stripeData.stripeCustomerId
          }).eq('id',customer.id);
        }

        await supabase.from('invoices').update({
          invoice_number:stripeData.number || null,
          status:'sent',
          stripe_invoice_id:stripeData.id,
          stripe_status:stripeData.status,
          hosted_invoice_url:stripeData.hostedInvoiceUrl
        }).eq('id',invoice.id);

        setMessage('Invoice created and Stripe payment page is ready.');
      }
    } catch(err){
      setMessage('GPPS invoice created. Stripe connection failed: '+(err instanceof Error ? err.message : 'Unknown error'));
    }

    setEstimateId('');
    setShowCreate(false);
    await load();
    setBusy(false);
  }

  async function refreshStripeStatus(invoice:InvoiceRow){
    if(!invoice.stripe_invoice_id){
      setMessage('This invoice does not have a Stripe invoice yet.');
      return;
    }

    setBusy(true);
    const response=await fetch('/api/stripe/invoice-status?invoiceId='+encodeURIComponent(invoice.stripe_invoice_id));
    const data=await response.json();

    if(!response.ok){
      setMessage(data.error || 'Unable to retrieve Stripe status.');
      setBusy(false);
      return;
    }

    await supabase.from('invoices').update({
      stripe_status:data.status,
      status:data.status==='paid' ? 'paid' : invoice.status,
      hosted_invoice_url:data.hostedInvoiceUrl || invoice.hosted_invoice_url,
      invoice_number:data.number || invoice.invoice_number,
      paid_at:data.status==='paid' ? new Date().toISOString() : null
    }).eq('id',invoice.id);

    setMessage('Stripe status refreshed: '+data.status);
    await load();
    setBusy(false);
  }

  return <div>
    <p className="kicker">Billing</p>
    <h1 className="page-title">Invoices</h1>
    <p className="subtitle">GPPS owns the invoice record; Stripe provides the secure payment page when connected.</p>

    <div className="card">
      <div className="actions">
        <button className="btn btn-primary" onClick={()=>setShowCreate(v=>!v)}>+ Create invoice</button>
      </div>

      {showCreate && <div className="card" style={{marginTop:14,boxShadow:'none'}}>
        <h2 className="section-title">Create from estimate</h2>
        <label>
          <div className="secondary">Estimate</div>
          <select value={estimateId} onChange={e=>setEstimateId(e.target.value)} style={inputStyle}>
            <option value="">Select estimate</option>
            {estimates.map(e=><option key={e.id} value={e.id}>
              {customerName(e.jobs?.customers)} — {e.jobs?.title || 'Job'} — ${Number(e.total).toFixed(2)} ({e.status})
            </option>)}
          </select>
        </label>
        <div className="actions" style={{marginTop:12}}>
          <button className="btn btn-primary" onClick={createInvoice} disabled={busy || !estimateId}>{busy?'Creating…':'Create invoice'}</button>
          <button className="btn btn-secondary" onClick={()=>setShowCreate(false)} disabled={busy}>Cancel</button>
        </div>
      </div>}

      {message && <div className="secondary" style={{marginTop:14}}>{message}</div>}

      <div className="list" style={{marginTop:12}}>
        {invoices.length===0 && <div className="secondary">No invoices yet. Create one from a saved estimate.</div>}
        {invoices.map(invoice=>{
          const c=invoice.jobs?.customers;
          const name=c?.company_name || [c?.first_name,c?.last_name].filter(Boolean).join(' ') || 'Customer';

          return <div className="list-item" key={invoice.id}>
            <div>
              <div className="primary">Invoice {invoice.invoice_number ? '#'+invoice.invoice_number : '(GPPS draft)'}</div>
              <div className="secondary">{name} · {invoice.jobs?.title || 'Job'} · {invoice.stripe_status || invoice.status}</div>
            </div>
            <div style={{textAlign:'right'}}>
              <div className="primary money">${Number(invoice.total).toFixed(2)}</div>
              <div className="actions" style={{justifyContent:'flex-end',marginTop:6}}>
                {invoice.hosted_invoice_url && <a className="btn btn-primary" href={invoice.hosted_invoice_url} target="_blank" rel="noreferrer">Open payment page</a>}
                <button className="btn btn-secondary" onClick={()=>refreshStripeStatus(invoice)} disabled={busy || !invoice.stripe_invoice_id}>Refresh Stripe status</button>
              </div>
            </div>
          </div>
        })}
      </div>
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
