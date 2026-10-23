import Link from 'next/link';

const metrics = [
  ['Open jobs','3'],
  ['Estimates awaiting approval','2'],
  ['Unpaid invoices','$680'],
  ['Paid this month','$4,920']
];

export default function Dashboard(){
  return <div>
    <p className="kicker">Field dashboard</p>
    <h1 className="page-title">Today</h1>
    <p className="subtitle">What needs your attention in the field and at the office.</p>

    <div className="grid grid-4">
      {metrics.map(([a,b]) => <div className="card" key={a}>
        <div className="metric-label">{a}</div>
        <div className="metric-value money">{b}</div>
      </div>)}
    </div>

    <div className="grid grid-2" style={{marginTop:16}}>
      <section className="card">
        <h2 className="section-title">Today&apos;s work</h2>
        <div className="list">
          <div className="list-item"><div><div className="primary">Bathroom ceiling repair</div><div className="secondary">9:00 AM · Wayne</div></div><span className="badge success">Scheduled</span></div>
          <div className="list-item"><div><div className="primary">Kitchen exhaust diagnosis</div><div className="secondary">1:30 PM · Riverdale</div></div><span className="badge">Confirmed</span></div>
        </div>
      </section>
      <section className="card">
        <h2 className="section-title">Needs attention</h2>
        <div className="list">
          <div className="list-item"><div><div className="primary">Estimate #1048</div><div className="secondary">Viewed yesterday, not approved</div></div><span className="badge warn">Follow up</span></div>
          <div className="list-item"><div><div className="primary">Invoice #1047</div><div className="secondary">$680 outstanding</div></div><span className="badge warn">Unpaid</span></div>
        </div>
      </section>
    </div>

    <div className="actions" style={{marginTop:16}}>
      <Link className="btn btn-primary" href="/jobs">+ New job</Link>
      <Link className="btn btn-secondary" href="/estimates">Build estimate</Link>
    </div>
    <Link className="fab" href="/jobs">+ New job</Link>
  </div>
}
