import { Link } from 'react-router-dom';

function NotFoundPage() {
  return (
    <div className="text-center py-16">
      <h1 className="text-2xl font-bold text-slate-900">Page not found</h1>
      <p className="mt-2 text-slate-600">The page you requested does not exist.</p>
      <Link to="/" className="mt-4 inline-block text-sky-600 hover:underline">
        Back to system status
      </Link>
    </div>
  );
}

export default NotFoundPage;
