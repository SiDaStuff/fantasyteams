import { Outlet } from 'react-router-dom';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';

/** Global shell: sticky navbar, page content, footer. */
export function AppLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-navy-950">
      <Navbar />
      <main id="main-content" className="flex-1" tabIndex={-1}>
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
