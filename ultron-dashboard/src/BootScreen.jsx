import { useState, useEffect, useRef } from 'react';
import { CheckCircle2, LoaderCircle } from 'lucide-react';
import BrandMark from './components/BrandMark';
import { API_BASE, pingAPI, getApiKey } from './api';

const SERVICES = [
  { id: 'api', name: 'API Gateway' },
  { id: 'ingestion', name: 'Log Ingestion' },
  { id: 'detector', name: 'Anomaly Detector' },
  { id: 'rca', name: 'RCA Engine' },
];

export default function BootScreen({ onReady }) {
  const [statuses, setStatuses] = useState({
    api: 'Starting...',
    ingestion: 'Starting...',
    detector: 'Starting...',
    rca: 'Starting...',
  });

  const onReadyCalled = useRef(false);

  useEffect(() => {
    let mounted = true;

    const checkHealth = async () => {
      try {
        const isUp = await pingAPI();
        if (isUp && mounted && !onReadyCalled.current) {
          // Mark all UP and transition
          setStatuses({
            api: 'UP',
            ingestion: 'UP',
            detector: 'UP',
            rca: 'UP',
          });
          onReadyCalled.current = true;
          setTimeout(() => {
            if (mounted) onReady();
          }, 800);
          return;
        }

        // Try /health/services-status if available
        const res = await fetch(`${API_BASE}/health/services-status`, {
          headers: {
            'X-Ultron-Api-Key': getApiKey(),
          },
          cache: 'no-store',
          signal: AbortSignal.timeout(4000),
        }).catch(() => null);

        if (res && res.ok) {
          const data = await res.json().catch(() => ({}));
          if (mounted) {
            setStatuses({
              api: 'UP',
              ingestion: data.ingestion || 'UP',
              detector: data.detector || 'UP',
              rca: data.rca || 'UP',
            });
            onReadyCalled.current = true;
            setTimeout(() => {
              if (mounted) onReady();
            }, 800);
            return;
          }
        }
      } catch {
        // Continue polling
      }
    };

    checkHealth();
    const interval = setInterval(() => {
      if (!onReadyCalled.current) {
        checkHealth();
      }
    }, 3000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [onReady]);

  const serviceList = SERVICES.map(svc => ({
    name: svc.name,
    status: statuses[svc.id] || 'Starting...',
  }));

  const upCount = serviceList.filter(s => s.status === 'UP').length;
  const progressPercent = (upCount / SERVICES.length) * 100;

  return (
    <div className="boot-screen">
      <BrandMark className="boot-logo" />
      <h1 className="boot-title">Intelligence is coming online.</h1>
      <p className="boot-subtitle">
        Connecting to the backend microservice cluster on Google Cloud Platform...
      </p>

      <div className="boot-services">
        {serviceList.map(s => (
          <div key={s.name} className={`boot-service ${s.status === 'UP' ? 'ready' : ''}`}>
            <div className={`boot-service-icon ${s.status === 'UP' ? '' : 'spinning'}`}>
              {s.status === 'UP' ? <CheckCircle2 size={18} /> : <LoaderCircle size={18} />}
            </div>
            <div className="boot-service-name">{s.name}</div>
            <div className={`boot-service-status ${s.status === 'UP' ? 'up' : 'starting'}`}>
              {s.status === 'UP' ? 'UP' : 'Starting...'}
            </div>
          </div>
        ))}
      </div>

      <div className="boot-progress">
        <div
          className="boot-progress-bar"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      <button className="btn" onClick={onReady}>
        Skip to Dashboard &rarr;
      </button>
    </div>
  );
}
