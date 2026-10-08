import { useEffect, useState } from 'react';
import { getHealth } from '../features/system/systemApi.js';

/** Fetches backend health status for the system status page. */
export default function useHealthStatus() {
  const [state, setState] = useState({ loading: true, health: null, error: null });

  useEffect(() => {
    let cancelled = false;

    getHealth()
      .then((res) => {
        if (!cancelled) setState({ loading: false, health: res.data, error: null });
      })
      .catch((err) => {
        if (!cancelled) setState({ loading: false, health: null, error: err.message });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
