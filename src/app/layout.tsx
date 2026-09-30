import type { ReactNode } from 'react';

export const metadata = {
  title: 'Contractor MVP',
  description: 'Customer → Job → Estimate → Components → Invoice → Payment'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{fontFamily:'Arial, sans-serif', margin:0, background:'#f6f7f8', color:'#111'}}>
        <div style={{display:'grid', gridTemplateColumns:'220px 1fr', minHeight:'100vh'}}>
          <aside style={{background:'#111827', color:'white', padding:20}}>
            <h2 style={{marginTop:0}}>Contractor MVP</h2>
            {['dashboard','customers','jobs','components','estimates','invoices'].map(x => (
              <div key={x} style={{margin:'14px 0'}}><a href={'/'+x} style={{color:'white', textDecoration:'none', textTransform:'capitalize'}}>{x}</a></div>
            ))}
          </aside>
          <main style={{padding:32}}>{children}</main>
        </div>
      </body>
    </html>
  );
}
