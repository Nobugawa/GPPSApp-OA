export default function Customers(){
  return <div>
    <p className="kicker">CRM</p>
    <h1 className="page-title">Customers</h1>
    <p className="subtitle">Customers and properties stay separate so one customer can own multiple locations.</p>
    <div className="card">
      <div className="actions"><button className="btn btn-primary">+ Add customer</button><button className="btn btn-secondary">Import contacts</button></div>
      <div className="list" style={{marginTop:12}}>
        <div className="list-item"><div><div className="primary">Sample customer</div><div className="secondary">Residential · Riverdale, NJ</div></div><span className="badge">2 jobs</span></div>
      </div>
    </div>
  </div>
}
