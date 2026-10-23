export default function Estimates(){
  return <div>
    <p className="kicker">Estimate builder</p>
    <h1 className="page-title">Build an estimate</h1>
    <p className="subtitle">Field-first quoting with structured labor, parts and materials.</p>
    <div className="quote-builder">
      <section className="card">
        <div className="group-head"><div><div className="primary">Bathroom ceiling repair</div><div className="secondary">Sample customer · Wayne, NJ</div></div><button className="btn btn-secondary">Add photos</button></div>
        <div className="group"><div className="group-head"><strong>Labor</strong><button className="btn btn-secondary">+ Add</button></div><div className="line-row"><div><div className="primary">Repair failing tape seam, prep and paint</div><div className="secondary">Owner labor · 6.5 hr</div></div><strong className="money">$780</strong></div></div>
        <div className="group"><div className="group-head"><strong>Parts</strong><button className="btn btn-secondary">+ Add</button></div><div className="line-row"><div className="secondary">No parts added</div><strong>$0</strong></div></div>
        <div className="group"><div className="group-head"><strong>Materials</strong><button className="btn btn-secondary">+ Add</button></div><div className="line-row"><div><div className="primary">Compound, tape, primer, paint & consumables</div><div className="secondary">Grouped customer-facing line</div></div><strong className="money">$165</strong></div></div>
        <div className="actions" style={{marginTop:16}}><button className="btn btn-secondary">🎙 Dictate scope</button><button className="btn btn-secondary">✨ Suggest from photos</button></div>
      </section>
      <aside className="card">
        <p className="kicker">Customer price</p><div className="metric-value money">$945</div>
        <p className="secondary">Internal cost/margin stays hidden unless you expand the internal profitability view.</p>
        <div className="actions" style={{marginTop:18}}><button className="btn btn-primary">Preview estimate</button><button className="btn btn-secondary">Save draft</button></div>
      </aside>
    </div>
  </div>
}
