import type { ReactNode } from 'react';
import Link from 'next/link';
import AppHeader from '../components/AppHeader';
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
          <AppHeader />
          <div className="desktop-grid">
            <aside className="sidebar">
              {nav.map(([label,href]) => <Link className="navlink" href={href} key={href}>{label}</Link>)}
            </aside>
            <div className="content-column">
              <main className="main">{children}</main>
              <footer className="app-footer">GPPS Field v0.7</footer>
            </div>
          </div>
          <nav className="bottom-nav">
            {nav.slice(0,4).map(([label,href,icon]) => <Link href={href} key={href}><span>{icon}</span>{label}</Link>)}
            <Link href="/account"><span>•••</span>More</Link>
          </nav>
        </div>
      </body>
    </html>
  );
}
