export default function Jobs(){
  return <div>
    <p className="kicker">Field work</p>
    <h1 className="page-title">Jobs</h1>
    <p className="subtitle">One place for scope, photos, appointments, estimate, invoice and job history.</p>
    <div className="card">
      <div className="actions"><button className="btn btn-primary">+ New job</button><button className="btn btn-secondary">Upload photos</button></div>
      <div className="list" style={{marginTop:12}}>
        <div className="list-item"><div><div className="primary">Bathroom ceiling repair</div><div className="secondary">Tape repair · prep · ceiling/wall paint</div></div><span className="badge success">Scheduled</span></div>
        <div className="list-item"><div><div className="primary">Kitchen exhaust diagnosis</div><div className="secondary">Motor sourcing · existing housing assessment</div></div><span className="badge">Estimate</span></div>
      </div>
    </div>
  </div>
}
