import { Link } from 'react-router-dom';

/**
 * Reusable PageHeader for ERP pages.
 */
export function PageHeader({ title, subtitle, backLink, backLabel, actions }) {
  return (
    <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div>
        {backLink && (
          <Link
            to={backLink}
            className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-sky-700 transition-colors mb-1"
          >
            ← {backLabel || 'Back'}
          </Link>
        )}
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
    </div>
  );
}

export default PageHeader;
