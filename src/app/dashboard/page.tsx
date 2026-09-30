const cards = [
  ['Open jobs','0'],['Estimates awaiting approval','0'],['Unpaid invoices','$0'],['Paid this month','$0']
];
export default function Dashboard(){
  return <div><h1>Dashboard</h1><div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:16}}>{cards.map(([a,b])=><div key={a} style={{background:'white',padding:20,borderRadius:10,border:'1px solid #ddd'}}><div style={{fontSize:13,color:'#666'}}>{a}</div><div style={{fontSize:28,fontWeight:700,marginTop:8}}>{b}</div></div>)}</div></div>
}
