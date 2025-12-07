import { useEffect, useRef, useState } from 'react';
import { GoldOrientationService } from '../../../services/GoldOrientationService';

type OrientationServiceState = {
  service: GoldOrientationService | null;
  loading: boolean;
  error: Error | null;
};

export const useOrientationService = (): OrientationServiceState => {
  const [state, setState] = useState<OrientationServiceState>({
    service: null,
    loading: true,
    error: null,
  });

  const initializedRef = useRef(false);

  useEffect(() => {
    if (initializedRef.current) return;

    let cancelled = false;
    const svc = new GoldOrientationService();

    const load = async () => {
      try {
        await svc.load();
        if (cancelled) return;

        initializedRef.current = true;
        setState({
          service: svc,
          loading: false,
          error: null,
        });

        console.log('✅ Orientation service loaded');
      } catch (err: any) {
        if (cancelled) return;

        console.error('🎨 Failed to load orientations:', err);
        setState({
          service: null,
          loading: false,
          error:
            err instanceof Error
              ? err
              : new Error('Failed to load orientations'),
        });
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
};
