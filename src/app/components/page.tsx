export default function Components(){
  return <div>
    <p className="kicker">Canonical library</p>
    <h1 className="page-title">Labor, parts & materials</h1>
    <p className="subtitle">Reuse clean canonical items instead of creating duplicate descriptions job after job.</p>
    <div className="grid grid-2">
      <section className="card"><h2 className="section-title">Quick add</h2><div className="actions"><button className="btn btn-primary">+ Labor</button><button className="btn btn-secondary">+ Part</button><button className="btn btn-secondary">+ Material</button></div></section>
      <section className="card"><h2 className="section-title">AI-assisted matching</h2><p className="secondary">Before a new item is created, the app will suggest likely existing matches. You approve the final choice.</p></section>
    </div>
    <div className="card" style={{marginTop:16}}>
      <div className="list">
        <div className="list-item"><div><div className="primary">Drywall repair — small</div><div className="secondary">Labor · default 2.0 hr</div></div><span className="badge">Labor</span></div>
        <div className="list-item"><div><div className="primary">Joint compound</div><div className="secondary">Material · bucket/portion</div></div><span className="badge">Material</span></div>
        <div className="list-item"><div><div className="primary">Broan replacement motor/wheel</div><div className="secondary">Part · supplier/part number ready</div></div><span className="badge">Part</span></div>
      </div>
    </div>
  </div>
}
