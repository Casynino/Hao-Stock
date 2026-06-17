import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
      <div className="rounded-full bg-elevated p-4">
        <Compass className="h-8 w-8 text-muted" />
      </div>
      <h1 className="text-3xl font-bold text-foreground">Page not found</h1>
      <p className="max-w-sm text-muted">The page you're looking for doesn't exist or you don't have access to it.</p>
      <Link to="/" className="btn-primary">Back to dashboard</Link>
    </div>
  );
}
