import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { pageview } from '../lib/observability';

/** Sends a pageview to analytics on every route change. No-op until configured. */
export function RouteAnalytics() {
  const location = useLocation();
  useEffect(() => {
    pageview(location.pathname + location.search);
  }, [location.pathname, location.search]);
  return null;
}
