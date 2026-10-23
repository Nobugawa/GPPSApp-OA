import type { ReactNode } from 'react';
import Link from 'next/link';
import './globals.css';

export const metadata = {
  title: 'GPPS Field',
  description: 'Mobile-first field service estimating, jobs, invoicing and payments'
};

const nav = [
  ['Dashboard','/dashboard','⌂'],
  ['Customers','/customers','◎'],
  ['Jobs','/jobs','▣'],
  ['Items','/components','▤'],
  ['Estimates','/estimates','✎'],
  ['Invoices','/invoices','$']
];

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <header className="topbar">
            <Link href="/dashboard" className="brand">GPPS Field</Link>
            <div className="top-actions">
              <button className="icon-btn" aria-label="Search">⌕</button>
              <button className="icon-btn" aria-label="Menu">☰</button>
            </div>
          </header>
          <div className="desktop-grid">
            <aside className="sidebar">
              {nav.map(([label,href]) => <Link className="navlink" href={href} key={href}>{label}</Link>)}
            </aside>
            <main className="main">{children}</main>
          </div>
          <nav className="bottom-nav">
            {nav.slice(0,4).map(([label,href,icon]) => <Link href={href} key={href}><span>{icon}</span>{label}</Link>)}
            <Link href="/invoices"><span>•••</span>More</Link>
          </nav>
        </div>
      </body>
    </html>
  );
}
