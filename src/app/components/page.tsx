'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { createClient } from '../../lib/supabase/client';

type ComponentRow = {
  id:string;
  type:'labor'|'part'|'material'|'other';
  canonical_name:string;
  category:string | null;
  brand:string | null;
  part_number:string | null;
  unit:string | null;
  default_cost:number | null;
  default_sell_price:number | null;
  default_labor_hours:number | null;
  vendor:string | null;
  active:boolean;
};

const blank = {
  type:'labor' as ComponentRow['type'],
  canonical_name:'',
  category:'',
  brand:'',
  part_number:'',
  unit:'each',
  default_cost:'',
  default_sell_price:'',
  default_labor_hours:'',
  vendor:''
};

function normalizeName(value:string){
  return value.trim().toLowerCase().replace(/\s+/g,' ');
}

export default function Components(){
  const supabase=useMemo(()=>createClient(),[]);
  const [organizationId,setOrganizationId]=useState<string | null>(null);
  const [items,setItems]=useState<ComponentRow[]>([]);
  const [form,setForm]=useState({...blank});
  const [editingId,setEditingId]=useState<string | null>(null);
  const [showForm,setShowForm]=useState(false);
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);

  async function load(){
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

    const { data,error }=await supabase
      .from('components')
      .select('id,type,canonical_name,category,brand,part_number,unit,default_cost,default_sell_price,default_labor_hours,vendor,active')
      .eq('organization_id',orgId)
      .eq('active',true)
      .order('canonical_name');

    if(error) setMessage(error.message);
    else setItems((data ?? []) as ComponentRow[]);
  }

  useEffect(()=>{void load();},[]);

  function openNew(type:ComponentRow['type']){
    setEditingId(null);
    setForm({...blank,type,unit:type==='labor'?'hour':'each'});
    setShowForm(true);
    setMessage('');
  }

  function openEdit(item:ComponentRow){
    setEditingId(item.id);
    setForm({
      type:item.type,
      canonical_name:item.canonical_name,
      category:item.category ?? '',
      brand:item.brand ?? '',
      part_number:item.part_number ?? '',
      unit:item.unit ?? (item.type==='labor'?'hour':'each'),
      default_cost:item.default_cost == null ? '' : String(item.default_cost),
      default_sell_price:item.default_sell_price == null ? '' : String(item.default_sell_price),
      default_labor_hours:item.default_labor_hours == null ? '' : String(item.default_labor_hours),
      vendor:item.vendor ?? ''
    });
    setShowForm(true);
    setMessage('');
  }

  async function save(e:FormEvent){
    e.preventDefault();
    if(!organizationId || !form.canonical_name.trim()) return;
    setBusy(true);
    setMessage('');

    const payload={
      organization_id:organizationId,
      type:form.type,
      canonical_name:form.canonical_name.trim(),
      normalized_name:normalizeName(form.canonical_name),
      category:form.category.trim() || null,
      brand:form.brand.trim() || null,
      part_number:form.part_number.trim() || null,
      unit:form.unit.trim() || null,
      default_cost:form.default_cost.trim()==='' ? null : Number(form.default_cost),
      default_sell_price:form.default_sell_price.trim()==='' ? null : Number(form.default_sell_price),
      default_labor_hours:form.default_labor_hours.trim()==='' ? null : Number(form.default_labor_hours),
      vendor:form.vendor.trim() || null,
      active:true
    };

    const result=editingId
      ? await supabase.from('components').update(payload).eq('id',editingId)
      : await supabase.from('components').insert(payload);

    if(result.error){
      setMessage(result.error.message);
    } else {
      setShowForm(false);
      setEditingId(null);
      setForm({...blank});
      await load();
    }
    setBusy(false);
  }

  async function archive(id:string){
    const { error }=await supabase.from('components').update({active:false}).eq('id',id);
    if(error) setMessage(error.message);
    else await load();
  }

  return <div>
    <p className="kicker">Canonical library</p>
    <h1 className="page-title">Labor, parts & materials</h1>
    <p className="subtitle">Reuse clean canonical work tasks, parts and materials. Labor items describe the work itself—not the employee performing it.</p>

    <div className="grid grid-2">
      <section className="card">
        <h2 className="section-title">Quick add</h2>
        <div className="actions">
          <button className="btn btn-primary" onClick={()=>openNew('labor')}>+ Labor</button>
          <button className="btn btn-secondary" onClick={()=>openNew('part')}>+ Part</button>
          <button className="btn btn-secondary" onClick={()=>openNew('material')}>+ Material</button>
        </div>
      </section>
      <section className="card">
        <h2 className="section-title">AI-assisted matching</h2>
        <p className="secondary">Before a new item is created, the app will suggest likely existing matches. You approve the final choice.</p>
      </section>
    </div>

    {showForm && <form className="card" style={{marginTop:16}} onSubmit={save}>
      <div className="group-head">
        <h2 className="section-title" style={{margin:0}}>{editingId ? 'Edit item' : 'Add item'}</h2>
        <button className="btn btn-secondary" type="button" onClick={()=>setShowForm(false)}>Cancel</button>
      </div>

      <div className="grid grid-2">
        <label><div className="secondary">Type</div>
          <select value={form.type} onChange={e=>setForm({...form,type:e.target.value as ComponentRow['type']})} style={inputStyle}>
            <option value="labor">Labor</option>
            <option value="part">Part</option>
            <option value="material">Material</option>
            <option value="other">Other</option>
          </select>
        </label>

        <label><div className="secondary">{form.type==='labor' ? 'Labor task name' : 'Item name'}</div>
          <input required value={form.canonical_name} onChange={e=>setForm({...form,canonical_name:e.target.value})} style={inputStyle}/>
        </label>

        <label><div className="secondary">Category</div>
          <input value={form.category} onChange={e=>setForm({...form,category:e.target.value})} style={inputStyle}/>
        </label>

        <label><div className="secondary">Unit</div>
          <input value={form.unit} onChange={e=>setForm({...form,unit:e.target.value})} placeholder={form.type==='labor'?'hour':'each'} style={inputStyle}/>
        </label>

        {form.type!=='labor' && <>
          <label><div className="secondary">Brand</div>
            <input value={form.brand} onChange={e=>setForm({...form,brand:e.target.value})} style={inputStyle}/>
          </label>
          <label><div className="secondary">Part / model number</div>
            <input value={form.part_number} onChange={e=>setForm({...form,part_number:e.target.value})} style={inputStyle}/>
          </label>
          <label><div className="secondary">Vendor</div>
            <input value={form.vendor} onChange={e=>setForm({...form,vendor:e.target.value})} style={inputStyle}/>
          </label>
        </>}

        <label><div className="secondary">Default internal cost</div>
          <input type="number" min="0" step="0.01" value={form.default_cost} onChange={e=>setForm({...form,default_cost:e.target.value})} style={inputStyle}/>
        </label>

        <label><div className="secondary">Default customer price</div>
          <input type="number" min="0" step="0.01" value={form.default_sell_price} onChange={e=>setForm({...form,default_sell_price:e.target.value})} style={inputStyle}/>
        </label>

        {form.type==='labor' && <label><div className="secondary">Default labor hours</div>
          <input type="number" min="0" step="0.25" value={form.default_labor_hours} onChange={e=>setForm({...form,default_labor_hours:e.target.value})} style={inputStyle}/>
        </label>}
      </div>

      <div className="actions" style={{marginTop:14}}>
        <button className="btn btn-primary" disabled={busy}>{busy?'Saving…':editingId?'Save changes':'Add item'}</button>
      </div>
    </form>}

    {message && <div className="secondary" style={{marginTop:12}}>{message}</div>}

    <div className="card" style={{marginTop:16}}>
      <div className="list">
        {items.length===0 && <div className="secondary">No canonical items yet. Use Quick add above.</div>}
        {items.map(item=><div className="list-item" key={item.id}>
          <div>
            <div className="primary">{item.canonical_name}</div>
            <div className="secondary">
              {item.type}
              {item.unit ? ' · '+item.unit : ''}
              {item.default_labor_hours != null ? ' · '+item.default_labor_hours+' hr' : ''}
              {item.part_number ? ' · '+item.part_number : ''}
            </div>
          </div>
          <div className="actions">
            <span className="badge">{item.type}</span>
            <button className="btn btn-secondary" onClick={()=>openEdit(item)}>Edit</button>
            <button className="btn btn-secondary" onClick={()=>archive(item.id)}>Archive</button>
          </div>
        </div>)}
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
