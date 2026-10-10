import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { globalSearch } from '../features/dataExchange/api.js';

const CATEGORY_META = {
  products: { label: 'Products', color: 'bg-emerald-100 text-emerald-800' },
  batches: { label: 'Batches', color: 'bg-teal-100 text-teal-800' },
  suppliers: { label: 'Suppliers', color: 'bg-blue-100 text-blue-800' },
  customers: { label: 'Customers', color: 'bg-sky-100 text-sky-800' },
  sales: { label: 'Sales', color: 'bg-indigo-100 text-indigo-800' },
  purchase_orders: { label: 'Purchase Orders', color: 'bg-purple-100 text-purple-800' },
  goods_receipts: { label: 'Goods Receipts', color: 'bg-violet-100 text-violet-800' },
  transfers: { label: 'Stock Transfers', color: 'bg-amber-100 text-amber-800' },
  quarantines: { label: 'Quarantine Cases', color: 'bg-orange-100 text-orange-800' },
  recalls: { label: 'Recalls', color: 'bg-rose-100 text-rose-800' },
  prescriptions: { label: 'Prescriptions', color: 'bg-cyan-100 text-cyan-800' },
  patients: { label: 'Patients', color: 'bg-pink-100 text-pink-800' },
};

export default function GlobalSearchBar() {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [results, setResults] = useState({});
  const [totalMatches, setTotalMatches] = useState(0);

  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const navigate = useNavigate();

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Keyboard shortcut listener (Ctrl+K or /)
  useEffect(() => {
    function handleKeyDown(e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setIsOpen(true);
      } else if (e.key === 'Escape') {
        setIsOpen(false);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Debounced search
  useEffect(() => {
    if (!query || query.trim().length < 2) {
      setResults({});
      setTotalMatches(0);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const timer = setTimeout(async () => {
      try {
        const res = await globalSearch(query.trim());
        setResults(res.results || {});
        setTotalMatches(res.totalMatches || 0);
        setIsOpen(true);
      } catch (err) {
        // Silently capture 403 (unauthorized for search) or errors
        if (err.response?.status === 403) {
          setError('Search is restricted for your role.');
        } else {
          setError('Search failed. Please try again.');
        }
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  const handleSelect = (route) => {
    setIsOpen(false);
    setQuery('');
    navigate(route);
  };

  const categories = Object.keys(results);

  return (
    <div ref={containerRef} className="relative w-72 sm:w-96">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!isOpen && e.target.value.trim().length >= 2) setIsOpen(true);
          }}
          onFocus={() => {
            if (query.trim().length >= 2) setIsOpen(true);
          }}
          placeholder="Global Search (Press Ctrl+K)..."
          aria-label="Global Search"
          className="w-full pl-9 pr-16 py-1.5 text-sm bg-slate-50 border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all"
        />
        <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-400">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <div className="absolute inset-y-0 right-0 pr-2 flex items-center gap-1">
          {loading && (
            <svg className="animate-spin h-4 w-4 text-emerald-600" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
          )}
          {query && (
            <button
              onClick={() => {
                setQuery('');
                setIsOpen(false);
              }}
              className="text-slate-400 hover:text-slate-600 p-0.5 rounded"
              title="Clear"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Results Dropdown */}
      {isOpen && (
        <div className="absolute left-0 right-0 mt-1 max-h-96 overflow-y-auto bg-white rounded-lg shadow-xl border border-slate-200 z-50 divide-y divide-slate-100">
          {error && (
            <div className="p-3 text-sm text-rose-600 bg-rose-50 flex items-center gap-2">
              <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          {!error && !loading && totalMatches === 0 && query.trim().length >= 2 && (
            <div className="p-4 text-center text-sm text-slate-500">
              No records found matching "{query}" across your authorized modules.
            </div>
          )}

          {!error && categories.map((catKey) => {
            const meta = CATEGORY_META[catKey] || { label: catKey, color: 'bg-slate-100 text-slate-800' };
            const items = results[catKey] || [];
            return (
              <div key={catKey} className="p-2">
                <div className="px-2 py-1 text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                  <span>{meta.label}</span>
                  <span className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">{items.length}</span>
                </div>
                <div className="mt-1 space-y-1">
                  {items.map((item) => (
                    <button
                      key={`${catKey}-${item.id}`}
                      onClick={() => handleSelect(item.route)}
                      className="w-full text-left px-2.5 py-2 rounded-md hover:bg-slate-50 transition-colors flex items-center justify-between group focus:outline-none focus:bg-slate-100"
                    >
                      <div className="min-w-0 pr-2">
                        <div className="text-sm font-medium text-slate-800 group-hover:text-emerald-700 truncate">
                          {item.title}
                        </div>
                        {item.subtitle && (
                          <div className="text-xs text-slate-500 truncate">
                            {item.subtitle}
                          </div>
                        )}
                      </div>
                      {item.badge && (
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full uppercase tracking-wider flex-shrink-0 ${meta.color}`}>
                          {item.badge}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
