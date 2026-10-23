export default function Invoices(){
  return <div>
    <p className="kicker">Billing</p>
    <h1 className="page-title">Invoices</h1>
    <p className="subtitle">The app owns the workflow; Stripe handles secure payment collection.</p>
    <div className="card">
      <div className="actions"><button className="btn btn-primary">+ Create invoice</button><button className="btn btn-secondary">Open Stripe status</button></div>
      <div className="list" style={{marginTop:12}}>
        <div className="list-item"><div><div className="primary">Invoice #1047</div><div className="secondary">Sample customer · sent</div></div><div style={{textAlign:'right'}}><div className="primary money">$680</div><span className="badge warn">Unpaid</span></div></div>
      </div>
    </div>
  </div>
}
