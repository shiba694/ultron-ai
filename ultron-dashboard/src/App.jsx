import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  BarChart2,
  AlertCircle,
  Settings,
  Activity,
  Server,
  Database,
  CheckCircle2,
  XCircle,
  Clock,
  ShieldAlert,
  Play,
  Square,
  Search,
  Menu,
  ChevronLeft,
  Sun,
  Moon,
  Edit3,
  ArrowUpRight,
  FlaskConical,
  Zap,
  Timer,
  Unplug,
  Droplets,
  Link2,
  ShieldCheck,
  SlidersHorizontal,
  Cloud,
  ScanLine
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';
import './index.css';
import BrandMark from './components/BrandMark';
import OverviewHero from './components/OverviewHero';
import IncidentOverview from './components/IncidentOverview';
import { hasAIAnalysis, hasManualAnalysis, showAIAnalysis } from './components/incidentStates';
import IncidentWorkflow from './components/IncidentWorkflow';
import { api, pingAPI } from './api';
import BootScreen from './BootScreen';
import { useSessionHeartbeat } from './hooks/useSessionHeartbeat';
import { subscribeToIncidents, clearFirestoreIncidents } from './firebase';



function parseLocalDate(dateStr) {
  if (!dateStr) return null;
  if (dateStr instanceof Date) return isNaN(dateStr.getTime()) ? null : dateStr;
  if (typeof dateStr === 'number') return new Date(dateStr);

  let str = String(dateStr).trim();
  // Normalize space separator to 'T' (e.g. '2026-09-03 14:01:23' -> '2026-09-03T14:01:23')
  if (/^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}/.test(str)) {
    str = str.replace(' ', 'T');
  }

  // If timestamp has no timezone offset (e.g. '2026-09-03T14:01:23' from UTC backend),
  // treat it as UTC by appending 'Z' so it correctly converts to the local machine time!
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(str) && !str.endsWith('Z') && !/[+-]\d{2}(:\d{2})?$/.test(str)) {
    str += 'Z';
  }

  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

function formatTime(dateStr) {
  const d = parseLocalDate(dateStr);
  if (!d) return '—';
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatDate(dateStr) {
  const d = parseLocalDate(dateStr);
  if (!d) return '—';
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) + ' ' + formatTime(d);
}

function formatMTTR(seconds) {
  if (!seconds) return '—';
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${Math.round(seconds / 3600)}h ${Math.round((seconds % 3600) / 60)}m`;
}

function getServiceClass(name) {
  if (!name) return '';
  const key = name.split('-')[0];
  return `service-${key}`;
}

function timeAgo(dateStr) {
  const d = parseLocalDate(dateStr);
  if (!d) return '';
  const now = new Date();
  const diff = Math.max(0, Math.floor((now - d) / 1000));
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function App() {
  const [currentView, setCurrentView] = useState('dashboard');
  const [booting, setBooting] = useState(true);

  // Skip boot screen immediately if API gateway is already active
  useEffect(() => {
    if (typeof pingAPI === 'function') {
      pingAPI().then(alive => {
        if (alive) setBooting(false);
      }).catch(() => {});
    }
  }, []);

  // ─── Session Heartbeat & Eco-Mode Guard ────────────────────────────────
  const { isIdle, resumeSession } = useSessionHeartbeat({
    enabled: !booting,
    onResume: () => setBooting(true),
  });
  const [incidents, setIncidents] = useState([]);
  const [page] = useState(0);
  const [selected, setSelected] = useState(null);
  const [activeTab, setActiveTab] = useState('details');
  const [stats, setStats] = useState(null);
  const [health, setHealth] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [simRunning, setSimRunning] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [modalForm, setModalForm] = useState({
    rootCause: '', rcaSummary: '', impactAnalysis: '', suggestedFix: '', prevention: ''
  });
  const [loading, setLoading] = useState(true);
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [retryingMap, setRetryingMap] = useState({});
  const [theme, setTheme] = useState(() => localStorage.getItem('ultron-theme') || 'dark');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [firestoreActive, setFirestoreActive] = useState(false);
  const [incidentSearch, setIncidentSearch] = useState('');
  const visibleIncidents = useMemo(() => {
    const search = incidentSearch.trim().toLowerCase();
    return incidents.filter(incident => !search || [incident.incidentNumber, incident.title, incident.serviceName, incident.severity, incident.status].some(value => value?.toLowerCase().includes(search)));
  }, [incidents, incidentSearch]);

  // Chaos panel state
  const [chaosTarget, setChaosTarget] = useState('payment-service');
  const [chaosServices, setChaosServices] = useState(['payment-service', 'order-service', 'inventory-service', 'notification-service', 'user-service']);
  const [chaosScenarios, setChaosScenarios] = useState([]);
  const [injecting, setInjecting] = useState(null);

  // Settings state
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [apiKeyMasked, setApiKeyMasked] = useState('');
  const [llmTestResult, setLlmTestResult] = useState(null);
  const [logsPerSecond, setLogsPerSecond] = useState(5);
  const [resetting, setResetting] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // Dark/Light mode persistence
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('ultron-theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(prev => prev === 'light' ? 'dark' : 'light');

  const addToast = useCallback((message, type = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  }, []);

  const loadData = useCallback(async () => {
    try {
      const [incidentData, sData, hData, sim] = await Promise.all([
        api.getIncidents(page, 50),
        api.getStats(),
        api.getHealth(),
        api.getSimulationStatus(),
      ]);

      const loadedIncidents = incidentData?.content || [];

      setIncidents(prev => {
        if (!loadedIncidents || loadedIncidents.length === 0) {
          return [];
        }
        const map = new Map();
        loadedIncidents.forEach(item => map.set(item.incidentId, item));

        // Poll results refresh loaded records; retain very recent in-flight items (< 20s).
        const recentThreshold = Date.now() - 20000;
        (prev || []).forEach(item => {
          if (map.has(item.incidentId)) {
            const dbItem = map.get(item.incidentId);
            map.set(item.incidentId, { ...item, ...dbItem });
          } else {
            const itemTime = new Date(item.detectedAt || item.createdAt).getTime();
            if (itemTime > recentThreshold) {
              map.set(item.incidentId, item);
            }
          }
        });

        const merged = Array.from(map.values());
        merged.sort((a, b) => new Date(b.detectedAt || b.createdAt) - new Date(a.detectedAt || a.createdAt));
        return merged;
      });

      // Keep selected incident synchronized with the database
      setSelected(prev => {
        if (!prev) return null;
        const match = loadedIncidents.find(i => i.incidentId === prev.incidentId);
        return match ? { ...prev, ...match } : prev;
      });

      setStats(sData);
      setHealth(hData);
      setSimRunning(sim?.active || false);
      setLoading(false);
    } catch (err) {
      console.error('Failed to load data:', err);
      setLoading(false);
    }
  }, [page]);

  // ─── Realtime Firestore Incident Subscription ──────────────────────────
  useEffect(() => {
    if (booting || isIdle) return;

    const unsubscribe = subscribeToIncidents((liveIncidents) => {
      if (liveIncidents && liveIncidents.length > 0) {
        setFirestoreActive(true);
        setIncidents(prev => {
          const map = new Map();
          (prev || []).forEach(item => map.set(item.incidentId, item));

          // Accept live Firestore items if they update an existing incident, or are recent (< 30m)
          const recentThreshold = Date.now() - (30 * 60 * 1000);
          liveIncidents.forEach(item => {
            const itemTime = new Date(item.detectedAt || item.createdAt).getTime();
            if (map.has(item.incidentId) || itemTime > recentThreshold || prev.length === 0) {
              const existing = map.get(item.incidentId);
              map.set(item.incidentId, existing ? { ...existing, ...item } : item);
            }
          });
          const merged = Array.from(map.values());
          merged.sort((a, b) => {
            const timeA = new Date(a.detectedAt || a.createdAt).getTime();
            const timeB = new Date(b.detectedAt || b.createdAt).getTime();
            return timeB - timeA;
          });
          return merged;
        });

        setSelected(prev => {
          if (!prev) return null;
          const match = liveIncidents.find(i => i.incidentId === prev.incidentId);
          return match ? { ...prev, ...match } : prev;
        });
        setLoading(false);
      }
    }, () => {
      setFirestoreActive(false);
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [booting, isIdle]);

  useEffect(() => {
    if (!selected) {
      setComments([]);
    }
  }, [selected]);

  useEffect(() => {
    if (!selected) return;
    const hasAi = showAIAnalysis(selected);
    const hasManual = hasManualAnalysis(selected);

    if (activeTab === 'analysis' && !hasAi && hasManual) {
      setActiveTab('manual');
    } else if (activeTab === 'manual' && !hasManual && hasAi) {
      setActiveTab('analysis');
    }
  }, [selected, activeTab]);

  useEffect(() => {
    if (booting || isIdle) return; // Halt polling when booting or in Eco-Mode

    loadData();
    // Real-time polling: 3s during active simulation, 5s during idle
    const pollInterval = simRunning ? 3000 : 5000;
    const interval = setInterval(loadData, pollInterval);
    return () => clearInterval(interval);
  }, [loadData, booting, isIdle, simRunning]);

  const trendData = useMemo(() => {
    let raw = stats?.dailyTrend || [];
    const result = [];
    const today = new Date();

    // Create an array of the last 7 days (including today)
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: '2-digit' });

      // Look for this date in the raw data
      const existing = raw.find(item => item.date === dateStr);
      result.push({
        date: dateStr,
        incidents: existing ? Number(existing.incidents) : 0
      });
    }

    return result;
  }, [stats?.dailyTrend]);

  // ─── Manual Disposition ────────────────────────────────────────────────
  const handleOpenManualModal = () => {
    if (!selected) return;
    if (selected.manualRootCause) {
      // Editing existing dual manual triage
      setModalForm({
        rootCause: selected.manualRootCause,
        rcaSummary: selected.manualRcaSummary || '',
        impactAnalysis: selected.manualImpactAnalysis || '',
        suggestedFix: selected.manualSuggestedFix || '',
        prevention: selected.manualPrevention || ''
      });
    } else if (selected.confidence == null && selected.rootCause && ['RCA_COMPLETE', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'].includes(selected.status)) {
      // Editing existing manual triage (from former awaiting triage)
      setModalForm({
        rootCause: selected.rootCause,
        rcaSummary: selected.manualRcaSummary || selected.rcaSummary || '',
        impactAnalysis: selected.manualImpactAnalysis || selected.impactAnalysis || '',
        suggestedFix: selected.manualSuggestedFix || selected.suggestedFix || '',
        prevention: selected.manualPrevention || selected.prevention || ''
      });
    } else {
      // Fresh manual triage — start completely blank so the analyst types their findings from scratch
      setModalForm({
        rootCause: '',
        rcaSummary: '',
        impactAnalysis: '',
        suggestedFix: '',
        prevention: ''
      });
    }
    setShowModal(true);
  };




  // ─── Action Handlers ──────────────────────────────────────────────────
  const handleSimulate = async () => {
    try {
      const res = await api.triggerSimulation();
      addToast(res.message, res.status === 'started' ? 'success' : 'warning');
      setSimRunning(res.status === 'started');
      setTimeout(loadData, 2000);
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const handleStopSimulation = async () => {
    try {
      const res = await api.stopSimulation();
      addToast(res.message || 'Simulation stopped', 'info');
      setSimRunning(false);
      setTimeout(loadData, 1000);
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const handleInjectAnomaly = async (scenarioId) => {
    if (!simRunning) {
      addToast('Start the simulation engine first!', 'warning');
      return;
    }
    try {
      setInjecting(scenarioId);
      const res = await api.injectAnomaly(scenarioId, chaosTarget);
      addToast(res.message || `🚨 Injected ${scenarioId} on ${chaosTarget}`, 'success');
      setTimeout(loadData, 1200);
      setTimeout(loadData, 2500);
      setTimeout(loadData, 4500);
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setInjecting(null);
    }
  };

  // Load chaos scenarios on mount
  useEffect(() => {
    const loadChaos = async () => {
      try {
        const [scenarios, services] = await Promise.all([
          api.getChaosScenarios(),
          api.getChaosServices(),
        ]);
        if (scenarios?.length) setChaosScenarios(scenarios);
        if (services?.length) setChaosServices(services);
      } catch { /* use defaults */ }
    };
    loadChaos();
  }, []);

  // Load settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const [keyData, simConfig] = await Promise.all([
          api.getApiKey(),
          api.getSimConfig(),
        ]);
        if (keyData?.maskedKey) setApiKeyMasked(keyData.maskedKey);
        if (simConfig?.logsPerSecond) setLogsPerSecond(simConfig.logsPerSecond);
      } catch { /* use defaults */ }
    };
    loadSettings();
  }, []);

  const handleSaveApiKey = async () => {
    if (!apiKeyInput.trim()) return;
    try {
      const res = await api.updateApiKey(apiKeyInput.trim());
      setApiKeyMasked(res.maskedKey || '••••••••');
      setApiKeyInput('');
      addToast('API key saved securely', 'success');
    } catch (err) { addToast(err.message, 'error'); }
  };

  const handleClearApiKey = async () => {
    try {
      await api.updateApiKey("");
      setApiKeyMasked("");
      setApiKeyInput("");
      addToast("API key cleared", "success");
    } catch (err) {
      addToast(err.message, "error");
    }
  };

  const handleTestLLM = async () => {
    try {
      setLlmTestResult(null);
      const res = await api.testLLM();
      setLlmTestResult(res);
    } catch (err) { setLlmTestResult({ success: false, message: err.message }); }
  };

  const handleFactoryReset = async () => {
    try {
      setResetting(true);
      await api.factoryReset();
      await clearFirestoreIncidents();
      addToast('🗑️ All data cleared successfully!', 'success');
      setShowResetConfirm(false);
      setSelected(null);
      setComments([]);
      setIncidents([]);
      await loadData();
    } catch (err) { addToast(err.message, 'error'); }
    finally { setResetting(false); }
  };

  const handleUpdateLogsPerSecond = async (val) => {
    setLogsPerSecond(val);
    try {
      await api.updateSimConfig({ logsPerSecond: val });
    } catch { /* silent */ }
  };

  const handleResolve = async (id) => {
    try {
      const updated = await api.resolveIncident(id);
      addToast(`Incident resolved! MTTR: ${formatMTTR(updated.mttrSeconds)}`, 'success');
      setSelected(updated);
      loadData();
    } catch (err) { addToast(err.message, 'error'); }
  };

  const handleDismiss = async (id) => {
    try {
      const updated = await api.dismissIncident(id);
      addToast('Incident dismissed as false positive', 'info');
      setSelected(updated);
      loadData();
    } catch (err) { addToast(err.message, 'error'); }
  };

  const handleManualDisposition = async () => {
    if (!selected) return;
    if (!modalForm.rootCause || !modalForm.rcaSummary || !modalForm.impactAnalysis || !modalForm.suggestedFix || !modalForm.prevention) {
      addToast('Please fill all mandatory fields to submit the manual triage report.', 'error');
      return;
    }
    try {
      const updated = await api.manualDisposition(selected.incidentId, modalForm);
      addToast('Manual triage applied successfully', 'success');
      setSelected(updated);
      setShowModal(false);
      setActiveTab('manual');
      setModalForm({ rootCause: '', rcaSummary: '', impactAnalysis: '', suggestedFix: '', prevention: '' });
      loadData();
    } catch (err) { addToast(err.message, 'error'); }
  };

  const handleAccept = async (id) => {
    try {
      const updated = await api.acceptIncident(id);
      addToast('Incident accepted — status: In Progress', 'success');
      setSelected(updated);
      loadData();
    } catch (err) { addToast(err.message, 'error'); }
  };

  const handleClose = async (id) => {
    try {
      const updated = await api.closeIncident(id);
      addToast('Incident closed', 'success');
      setSelected(updated);
      loadData();
    } catch (err) { addToast(err.message, 'error'); }
  };

  const handleRetryAnalysis = async (id) => {
    try {
      setRetryingMap(prev => ({ ...prev, [id]: true }));
      await api.retryAnalysis(id);
      addToast('AI analysis retry started...', 'info');

      // Optimistically update UI if currently viewing this incident
      setSelected(prev => (prev && prev.incidentId === id ? { ...prev, status: 'ASSESSING' } : prev));

      let attempts = 0;
      let wasAssessing = false;

      const pollInterval = setInterval(async () => {
        attempts++;
        try {
          const updated = await api.getIncident(id);

          if (updated.status === 'ASSESSING') {
            wasAssessing = true;
            setSelected(prev => (prev && prev.incidentId === id ? updated : prev));
          } else if (updated.status === 'RCA_COMPLETE' || (wasAssessing && updated.status === 'AWAITING_TRIAGE') || attempts > 15) {
            clearInterval(pollInterval);
            setSelected(prev => (prev && prev.incidentId === id ? updated : prev));
            loadData();
            setRetryingMap(prev => {
              const next = { ...prev };
              delete next[id];
              return next;
            });

            if (updated.status === 'RCA_COMPLETE') {
              addToast('AI analysis complete!', 'success');
            } else if (updated.status === 'AWAITING_TRIAGE') {
              addToast('AI analysis failed again.', 'error');
            }
          }
        } catch { /* ignore */ }
      }, 2000);
    } catch (err) {
      addToast(err.message, 'error');
      setRetryingMap(prev => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  };

  const loadComments = async (incidentId) => {
    try {
      const data = await api.getComments(incidentId);
      setComments(data);
    } catch { setComments([]); }
  };

  const handleAddComment = async () => {
    if (!selected || !newComment.trim()) return;
    try {
      await api.addComment(selected.incidentId, { author: 'Analyst', content: newComment.trim() });
      setNewComment('');
      loadComments(selected.incidentId);
      addToast('Work note added', 'success');
    } catch (err) { addToast(err.message, 'error'); }
  };

  const handleSelectIncident = async (inc) => {
    try {
      const full = await api.getIncident(inc.incidentId);
      setSelected(full);
      setActiveTab('details');
      loadComments(full.incidentId);
    } catch {
      setSelected(inc);
      setComments([]);
    }
  };

  // ─── Sub-Components ───────────────────────────────────────────────────
  const renderDashboardView = () => (
    <>
      <OverviewHero running={simRunning} onViewIncidents={() => setCurrentView('incidents')} />
      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-card__header">
            <span className="metric-card__label">Total Incidents</span>
            <Activity className="metric-card__icon" size={16} />
          </div>
          <div className="metric-card__value">{stats?.totalIncidents ?? '—'}</div>
          <div className="metric-card__sub">{stats?.totalAnomalies ?? 0} anomalies detected</div>
        </div>
        <div className="metric-card">
          <div className="metric-card__header">
            <span className="metric-card__label">Active Incidents</span>
            <ShieldAlert className="metric-card__icon" size={16} color="var(--severity-p1)" />
          </div>
          <div className="metric-card__value" style={{color: 'var(--severity-p1)'}}>{stats ? Math.max(0, (stats.totalIncidents ?? 0) - (stats.resolvedIncidents ?? 0) - (stats.closedCount ?? 0)) : '—'}</div>
          <div className="metric-card__sub">{stats?.awaitingTriageCount ?? 0} awaiting triage</div>
        </div>
        <div className="metric-card">
          <div className="metric-card__header">
            <span className="metric-card__label">Completed</span>
            <CheckCircle2 className="metric-card__icon" size={16} color="var(--accent-emerald)" />
          </div>
          <div className="metric-card__value" style={{color: 'var(--accent-emerald)'}}>{stats ? ((stats.resolvedIncidents ?? 0) + (stats.closedCount ?? 0)) : '—'}</div>
          <div className="metric-card__sub">Avg MTTR: {formatMTTR(stats?.averageMttrSeconds)}</div>
        </div>
        <div className="metric-card">
          <div className="metric-card__header">
            <span className="metric-card__label">Log Events</span>
            <Database className="metric-card__icon" size={16} />
          </div>
          <div className="metric-card__value">{stats?.totalLogEvents?.toLocaleString() ?? '—'}</div>
          <div className="metric-card__sub">Events in the evidence store</div>
        </div>
      </div>

      <div className="dashboard-grid">
        {/* Trend Graph */}
        <div className="dashboard-panel">
          <div className="panel-header">
            <span className="panel-title"><BarChart2 size={16} /> Incident activity</span><span className="panel-caption">Last 7 days</span>
          </div>
          <div className="trend-summary"><strong>{trendData.reduce((total, day) => total + day.incidents, 0)}</strong><span>incidents detected in this period</span></div>
          <div className="panel-content" style={{height: '250px', minHeight: '250px'}}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData} margin={{ top: 10, right: 15, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorEvents" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--accent-primary)" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="var(--accent-primary)" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} />
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-subtle)" />
                <Tooltip
                  contentStyle={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-medium)', borderRadius: '10px' }}
                  itemStyle={{ color: 'var(--text-primary)', fontWeight: 600 }}
                />
                <Area type="monotone" dataKey="incidents" stroke="var(--accent-primary)" strokeWidth={2.5} dot={false} activeDot={{ r: 5, strokeWidth: 3, stroke: 'var(--bg-card)' }} fillOpacity={1} fill="url(#colorEvents)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Health Grid */}
        <div className="dashboard-panel">
          <div className="panel-header">
            <span className="panel-title"><Server size={16} /> Service health</span><span className="panel-caption">{Object.keys(health?.services || {}).length} reporting</span>
          </div>
          <div className="panel-content">
            <div className="health-grid">
              {['payment-service', 'order-service', 'inventory-service', 'notification-service', 'user-service'].map(svc => {
                const sHealth = health?.services?.[svc];
                const status = sHealth?.status || 'UNKNOWN';
                return (
                  <div className="health-item" key={svc}>
                    <span className="health-item__name"><span className="service-icon"><Server size={15} /></span> {svc.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}</span>
                    <div className="health-item__metrics">
                      {sHealth && <span className="health-item__numbers">{Math.round(sHealth.errorRate * 100)}% err | p99: {Math.round(sHealth.p99Latency || 0)}ms</span>}
                      <span className={`health-indicator ${status.toLowerCase()}`}>{status.toLowerCase()}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ─── Chaos Engineering Panel ───────────────────────────────── */}
      <div className="chaos-panel">
        <div className="chaos-panel__header">
          <div><span className="chaos-panel__title"><FlaskConical size={17} /> Chaos Engineering Lab</span><p className="chaos-panel__subtitle">Introduce a failure. Watch the intelligence respond.</p></div>
          <div className="chaos-panel__controls">
            <label htmlFor="chaos-target" style={{fontSize: 'var(--text-label)', color: 'var(--text-secondary)', fontWeight: 600}}>Target:</label>
            <select id="chaos-target" className="chaos-panel__service-select" value={chaosTarget} onChange={e => setChaosTarget(e.target.value)}>
              {chaosServices.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <div className="chaos-grid">
            {(chaosScenarios.length > 0 ? chaosScenarios : [
              { id: 'ERROR_SPIKE', label: 'Error Spike', icon: '⚡' },
              { id: 'LATENCY_SURGE', label: 'Latency Surge', icon: '🐢' },
              { id: 'DB_OUTAGE', label: 'DB Outage', icon: '💥' },
              { id: 'MEMORY_LEAK', label: 'Memory Leak', icon: '💧' },
              { id: 'DOWNSTREAM_FAILURE', label: 'Downstream Timeout', icon: '🔗' },
              { id: 'RATE_LIMIT_SPIKE', label: 'Rate Limit', icon: '🛑' },
              { id: 'CONFIG_ERROR', label: 'Bad Config', icon: '📝' },
            ]).map(s => (
              <button
                key={s.id}
                className="chaos-btn"
                onClick={() => handleInjectAnomaly(s.id)}
                disabled={!simRunning || injecting === s.id}
                title={!simRunning ? 'Start simulation to enable this scenario' : s.label}
              >
                <span className="chaos-btn__icon">{(() => { const ScenarioIcon = ({ ERROR_SPIKE: Zap, LATENCY_SURGE: Timer, DB_OUTAGE: Unplug, MEMORY_LEAK: Droplets, DOWNSTREAM_FAILURE: Link2, RATE_LIMIT_SPIKE: ShieldCheck, CONFIG_ERROR: SlidersHorizontal })[s.id] || Zap; return <ScenarioIcon size={18} strokeWidth={1.5} />; })()}</span>
                {injecting === s.id ? 'Injecting...' : s.label}
              </button>
            ))}
          </div>
        {!simRunning && <div className="chaos-panel__disabled-msg"><Play size={12} /> Start the simulation engine to unlock anomaly injection.</div>}
      </div>

      {/* Latest investigations */}
      <div className="dashboard-panel" style={{marginBottom: 0}}>
        <div className="panel-header">
          <span className="panel-title"><Clock size={16} /> Latest investigations</span>
          <button className="btn" onClick={() => setCurrentView('incidents')} >View all <ArrowUpRight size={13} /></button>
        </div>
        <div className="panel-content no-pad">
          {incidents.slice(0, 5).map(inc => (
            <button type="button" key={inc.incidentId} className="feed-item" onClick={() => { setCurrentView('incidents'); handleSelectIncident(inc); }}>
              <div className="feed-item__header">
                <span className="feed-item__title">
                  <span className="incident-number-inline">{inc.incidentNumber || 'INC-NEW'}</span>
                  {inc.title || 'Untitled Incident'}
                </span>
                <span className={`badge badge-${inc.severity?.toLowerCase()}`}>{inc.severity}</span>
              </div>
              <div className="feed-item__meta">
                <span className={`badge badge-${inc.status?.toLowerCase()?.replace('_', '-')}`}>{({ RCA_COMPLETE: 'Analyzed', AWAITING_TRIAGE: 'Needs triage', IN_PROGRESS: 'In progress', ASSESSING: 'Assessing', NEW: 'New', RESOLVED: 'Resolved', CLOSED: 'Closed' })[inc.status] || inc.status}</span>
                <span className={getServiceClass(inc.serviceName)}>{inc.serviceName}</span>
                <span className="feed-item__time">{formatDate(inc.detectedAt)}</span>
              </div>
            </button>
          ))}
          {incidents.length === 0 && <div className="empty-state" style={{padding: '24px'}}>No recent activity.</div>}
        </div>
      </div>
    </>
  );

  const renderIncidentsView = () => (
    <>
    <div className="page-intro"><div className="eyebrow">FROM DETECTION TO RESOLUTION</div><h2>Investigate with clarity.</h2><p>Review the evidence, compare analyses, and move every incident forward.</p></div>
    <div className="incident-view">
      {/* Left: Incident List */}
      <div className={`incident-list-panel ${selected ? 'mobile-hide' : ''}`}>
        <div className="panel-header">
          <span className="panel-title">Incident queue</span>
          <span className="badge" style={{background: 'var(--bg-primary)'}}>{visibleIncidents.length} / {incidents.length}</span>
        </div>
        <div className="queue-search"><Search size={15} /><input aria-label="Search incidents" placeholder="Search incidents or services…" value={incidentSearch} onChange={e => setIncidentSearch(e.target.value)} />{incidentSearch && <button aria-label="Clear search" onClick={() => setIncidentSearch('')}><XCircle size={14} /></button>}</div>
        <div className="feed-list">
          {!loading && incidents.length > 0 && visibleIncidents.length === 0 && <div className="empty-state">No incidents match your search.</div>}
          {loading && <div className="empty-state"><div className="spinner" />Loading...</div>}
          {!loading && incidents.length === 0 && (
            <div className="empty-state">
              <div className="empty-state__icon"><Search /></div>
              <div>No incidents in queue.</div>
            </div>
          )}
          {visibleIncidents.map(inc => (
            <button type="button"
              key={inc.incidentId}
              className={`feed-item ${selected?.incidentId === inc.incidentId ? 'active' : ''} ${inc.rootCause === 'UNKNOWN' ? 'unknown' : ''}`}
              onClick={() => handleSelectIncident(inc)}
            >
              <div className="feed-item__header">
                <span className="feed-item__title">
                  <span className="incident-number-inline">{inc.incidentNumber || 'INC-NEW'}</span>
                  {inc.title || 'Untitled Incident'}
                </span>
                <span className={`badge badge-${inc.severity?.toLowerCase()}`}>{inc.severity}</span>
              </div>
              <div className="feed-item__meta">
                <span className={`badge badge-${inc.status?.toLowerCase()?.replace('_', '-')}`}>{({ RCA_COMPLETE: 'Analyzed', AWAITING_TRIAGE: 'Needs triage', IN_PROGRESS: 'In progress', ASSESSING: 'Assessing', NEW: 'New', RESOLVED: 'Resolved', CLOSED: 'Closed' })[inc.status] || inc.status}</span>
                <span className={getServiceClass(inc.serviceName)}>{inc.serviceName}</span>
                <span className="feed-item__time">{formatTime(inc.detectedAt)}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Right: Detail Panel */}
      <div className={`incident-detail-panel ${!selected ? 'mobile-hide' : ''}`}>
        {!selected ? (
          <div className="empty-state investigation-empty"><div className="empty-state__icon"><ScanLine /></div><h3>Your next insight starts here.</h3><p>{incidents.length === 0 ? 'Start a simulation to explore detection and analysis.' : 'Choose an incident to connect the evidence, understand its root cause, and plan your next move.'}</p><span className="eyebrow">EVIDENCE. ANALYSIS. ACTION.</span></div>
        ) : (
          <div className="detail-panel" style={{padding: 0}}>
            <div className="detail-header">
              <div className="detail-header-left">
                <button className="mobile-back-btn" onClick={() => setSelected(null)}>
                  <ChevronLeft size={16} /> Back
                </button>
                <div className="detail-header__top">
                  <span className="incident-number-badge">{selected.incidentNumber || 'INC-NEW'}</span>
                  <h2 className="detail-header__title">{selected.title}</h2>
                </div>
              </div>

              <div className="action-bar">
                {(selected.status === 'NEW' || selected.status === 'ASSESSING') && (
                  <span className="ai-processing-indicator">
                    <span className="spinner" style={{width: '14px', height: '14px'}} /> AI is analyzing this incident...
                  </span>
                )}
                {selected.status === 'AWAITING_TRIAGE' && (
                  <>
                    <button
                      className="btn btn-primary"
                      onClick={() => handleRetryAnalysis(selected.incidentId)}
                      disabled={!!retryingMap[selected.incidentId]}
                    >
                      {retryingMap[selected.incidentId] ? (
                        <><span className="spinner" style={{width: '14px', height: '14px'}} /> Retrying...</>
                      ) : (
                        '🔄 Retry AI Analysis'
                      )}
                    </button>
                    <button className="btn btn-warning" onClick={handleOpenManualModal}>
                      <ShieldAlert size={14} /> Manual Triage
                    </button>
                    <button className="btn btn-success" onClick={() => handleAccept(selected.incidentId)} disabled={!!retryingMap[selected.incidentId]}>
                      <CheckCircle2 size={14} /> Accept & Work
                    </button>
                    <button className="btn" onClick={() => handleDismiss(selected.incidentId)}>
                      <XCircle size={14} /> Dismiss
                    </button>
                  </>
                )}
                {selected.status === 'RCA_COMPLETE' && (
                  <>
                    <button className="btn btn-warning" onClick={handleOpenManualModal}>
                      <ShieldAlert size={14} /> {selected.manualRootCause ? 'Edit Manual Triage' : 'Manual Triage'}
                    </button>
                    <button className="btn btn-success" onClick={() => handleAccept(selected.incidentId)}>
                      <CheckCircle2 size={14} /> Accept & Work
                    </button>
                    <button className="btn" onClick={() => handleDismiss(selected.incidentId)}>
                      <XCircle size={14} /> Dismiss
                    </button>
                  </>
                )}
                {selected.status === 'IN_PROGRESS' && (
                  <>
                    <button className="btn btn-warning" onClick={handleOpenManualModal}>
                      <ShieldAlert size={14} /> {selected.manualRootCause ? 'Edit Manual Triage' : 'Manual Triage'}
                    </button>
                    <button className="btn btn-success" onClick={() => handleResolve(selected.incidentId)}>
                      <CheckCircle2 size={14} /> Resolve
                    </button>
                    <button className="btn" onClick={() => handleDismiss(selected.incidentId)}>
                      <XCircle size={14} /> Dismiss
                    </button>
                  </>
                )}
                {selected.status === 'RESOLVED' && (
                  <>
                    <button className="btn btn-warning" onClick={handleOpenManualModal}>
                      <ShieldAlert size={14} /> {selected.manualRootCause ? 'Edit Manual Triage' : 'Manual Triage'}
                    </button>
                    <button className="btn btn-primary" onClick={() => handleClose(selected.incidentId)}>
                      🔒 Close Incident
                    </button>
                  </>
                )}
                {selected.status === 'CLOSED' && (
                  <button className="btn btn-warning" onClick={handleOpenManualModal}>
                    <ShieldAlert size={14} /> {selected.manualRootCause ? 'Edit Manual Triage' : 'Manual Triage'}
                  </button>
                )}
              </div>
            </div>

            <IncidentWorkflow incident={selected} />

            {/* Top Level Tabs */}
            <div className="tabs">
              <button className={`tab ${activeTab === 'details' ? 'active' : ''}`} onClick={() => setActiveTab('details')}>
                Incident Details
              </button>

              {/* Keep unavailable AI analysis explicit after accepting without a report. */}
              {showAIAnalysis(selected) && (
                <button className={`tab ${activeTab === 'analysis' ? 'active' : ''}`} onClick={() => setActiveTab('analysis')}>
                  AI Analysis
                </button>
              )}

              {/* Show Manual Analysis tab if manual analysis was performed */}
              {hasManualAnalysis(selected) && (
                <button className={`tab ${activeTab === 'manual' ? 'active' : ''}`} onClick={() => setActiveTab('manual')}>
                  Manual Analysis
                </button>
              )}

              <button className={`tab ${activeTab === 'raw' ? 'active' : ''}`} onClick={() => setActiveTab('raw')}>
                Raw Logs
              </button>
            </div>

            {/* Tab Content */}
            <div className="detail-content">
              {activeTab === 'details' && (
                <>
                  <IncidentOverview incident={selected} formatDate={formatDate} formatMTTR={formatMTTR} />

                {/* Work Notes Section */}
                {!['NEW', 'ASSESSING'].includes(selected.status) && (
                  <div className="work-notes-section">
                    <div className="work-notes-header">
                      <span className="work-notes-title">Work Notes</span>
                      <span className="work-notes-count">{comments.length} {comments.length === 1 ? 'note' : 'notes'}</span>
                    </div>

                    {selected.status !== 'CLOSED' && (
                      <div className="work-notes-input-area">
                        <textarea
                          className="work-notes-textarea"
                          aria-label="Work note"
                          placeholder="Add a work note..."
                          value={newComment}
                          onChange={(e) => setNewComment(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter' && e.ctrlKey) handleAddComment(); }}
                        />
                        <button className="btn btn-primary work-notes-submit" onClick={handleAddComment} disabled={!newComment.trim()}>
                          Add Note
                        </button>
                      </div>
                    )}

                    <div className="work-notes-list">
                      {comments.length === 0 && (
                        <div className="work-notes-empty">No work notes yet. Add one to document your investigation.</div>
                      )}
                      {comments.map(c => (
                        <div key={c.commentId} className="work-note-item">
                          <div className="work-note-meta">
                            <span className="work-note-author">{c.author}</span>
                            <span className="work-note-time">{timeAgo(c.createdAt)}</span>
                          </div>
                          <div className="work-note-content">{c.content}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                </>
              )}

              {activeTab === 'analysis' && (
                <div className="rca-grid" style={{marginTop: '16px'}}>
                  {!hasAIAnalysis(selected) ? (
                    <div style={{padding: '24px', textAlign: 'center', color: 'var(--text-secondary)'}}>
                      ⚠️ AI analysis is unavailable for this incident. {selected.status === 'AWAITING_TRIAGE' ? 'Retry AI analysis, add manual triage, or Accept & Work to investigate without an AI report.' : 'Work can continue without an AI report. Add manual triage to document your findings.'}
                    </div>
                  ) : (
                    <>
                      <div>
                        <div className="rca-section__label">Root Cause</div>
                        <div className="rca-section__text">{selected.rootCause || 'Not determined'}</div>
                      </div>
                      <div>
                        <div className="rca-section__label">Summary</div>
                        <div className="rca-section__text">{selected.rcaSummary || 'No summary available'}</div>
                      </div>
                      <div>
                        <div className="rca-section__label">Impact Analysis</div>
                        <div className="rca-section__text">{selected.impactAnalysis || 'Not assessed'}</div>
                      </div>
                      <div>
                        <div className="rca-section__label">Suggested Fix</div>
                        <div className="rca-section__text">{selected.suggestedFix || 'No fix suggested'}</div>
                      </div>
                      <div>
                        <div className="rca-section__label">Prevention</div>
                        <div className="rca-section__text">{selected.prevention || 'No prevention steps'}</div>
                      </div>
                      {selected.confidence != null && (
                        <div>
                          <div className="rca-section__label">AI Confidence</div>
                          <div className="confidence-bar">
                            <div
                              className={`confidence-bar__fill ${(selected.confidence ?? 0) >= 0.7 ? 'confidence-high' : (selected.confidence ?? 0) >= 0.4 ? 'confidence-medium' : 'confidence-low'}`}
                              style={{ width: `${(selected.confidence ?? 0) * 100}%` }}
                            />
                          </div>
                          <div style={{fontSize: 'var(--text-meta)', color: 'var(--text-muted)', marginTop: '4px', fontWeight: 600}}>
                            {((selected.confidence ?? 0) * 100).toFixed(0)}% CONFIDENCE
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {activeTab === 'manual' && (
                <div className="rca-grid" style={{marginTop: '16px'}}>
                  <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', paddingBottom: '8px', borderBottom: '1px solid var(--border-subtle)'}}>
                    <span className="badge badge-rca-complete" style={{fontSize: 'var(--text-label)', padding: '4px 10px'}}>
                      🧠 Human Expert Analysis
                    </span>
                    <div style={{display: 'flex', alignItems: 'center', gap: '12px'}}>
                      {selected.manualTriagedAt && (
                        <span style={{fontSize: 'var(--text-label)', color: 'var(--text-muted)'}}>
                          Triaged: {formatDate(selected.manualTriagedAt)}
                        </span>
                      )}
                      <button className="btn" onClick={handleOpenManualModal} style={{padding: '3px 8px', fontSize: 'var(--text-label)'}}>
                        <Edit3 size={12} /> Edit
                      </button>
                    </div>
                  </div>
                  <div>
                    <div className="rca-section__label">Root Cause</div>
                    <div className="rca-section__text">{selected.manualRootCause || selected.rootCause || 'Not determined'}</div>
                  </div>
                  <div>
                    <div className="rca-section__label">Summary</div>
                    <div className="rca-section__text">{selected.manualRcaSummary || selected.rcaSummary || 'No summary available'}</div>
                  </div>
                  <div>
                    <div className="rca-section__label">Impact Analysis</div>
                    <div className="rca-section__text">{selected.manualImpactAnalysis || selected.impactAnalysis || 'Not assessed'}</div>
                  </div>
                  <div>
                    <div className="rca-section__label">Suggested Fix</div>
                    <div className="rca-section__text">{selected.manualSuggestedFix || selected.suggestedFix || 'No fix suggested'}</div>
                  </div>
                  <div>
                    <div className="rca-section__label">Prevention</div>
                    <div className="rca-section__text">{selected.manualPrevention || selected.prevention || 'No prevention steps'}</div>
                  </div>
                </div>
              )}

              {activeTab === 'raw' && (
                  <div className="raw-logs" style={{marginTop: '16px'}}>
                    {(() => {
                      if (!selected.relatedLogs || selected.relatedLogs === '[]' || selected.relatedLogs.trim() === '') {
                        return 'No raw logs available for this incident.';
                      }
                      try {
                        const parsed = JSON.parse(selected.relatedLogs);
                        if (!Array.isArray(parsed)) return selected.relatedLogs;
                        return parsed.map((log, idx) => {
                          if (typeof log === 'string') {
                            return (
                              <div key={idx} style={{marginBottom: '8px', paddingBottom: '8px', borderBottom: '1px solid var(--border-subtle)'}}>
                                <span>{log}</span>
                              </div>
                            );
                          }
                          const logTime = log.timestamp || log.time;
                          return (
                            <div key={idx} style={{marginBottom: '8px', paddingBottom: '8px', borderBottom: '1px solid var(--border-subtle)'}}>
                              <span style={{color: 'var(--text-muted)', marginRight: '8px'}}>[{logTime ? formatDate(logTime) : '—'}]</span>
                              <span style={{color: (log.logLevel || log.level) === 'ERROR' ? 'var(--severity-p0)' : (log.logLevel || log.level) === 'WARN' ? 'var(--severity-p1)' : 'var(--accent-cyan)', fontWeight: 600}}>{log.logLevel || log.level || 'INFO'}</span>
                              <span style={{marginLeft: '8px'}}>{log.message || JSON.stringify(log)}</span>
                            </div>
                          );
                        });
                      } catch {
                        return selected.relatedLogs;
                      }
                    })()}
                  </div>
                )}
              </div>
            </div>
        )}
      </div>
    </div>
    </>
  );

  // ─── Settings View ──────────────────────────────────────────────────────
  const renderSettingsView = () => (
    <>
    <div className="page-intro"><div className="eyebrow">YOUR COMMAND CENTER, CONFIGURED</div><h2>Fine-tune the intelligence.</h2><p>Manage your AI connection and shape the telemetry behind your investigations.</p></div>
    <div className="settings-view">
      {/* Section 1: AI & API Configuration */}
      <div className="settings-card">
        <div className="settings-card__header">
          <Activity size={16} />
          <span className="settings-card__title">AI & API Configuration</span>
        </div>
        <div className="settings-card__body">
          <div className="settings-field">
            <label className="settings-field__label" htmlFor="openrouter-key">OpenRouter API Key</label>
            {apiKeyMasked && (
              <span className="settings-badge success" style={{alignSelf: 'flex-start', marginBottom: '4px'}}>
                🔒 Current: {apiKeyMasked}
              </span>
            )}
            <div className="settings-field__row">
              <input
                id="openrouter-key"
                type="password"
                className="settings-input"
                placeholder="sk-or-v1-..."
                value={apiKeyInput}
                onChange={e => setApiKeyInput(e.target.value)}
              />
              <button className="btn btn-primary" onClick={handleSaveApiKey} disabled={!apiKeyInput.trim()} style={{whiteSpace: 'nowrap'}}>
                Save Key
              </button>
              <button className="btn btn-danger" onClick={handleClearApiKey} disabled={!apiKeyMasked} style={{whiteSpace: 'nowrap'}}>
                Clear Key
              </button>
              <button className="btn" onClick={handleTestLLM} style={{whiteSpace: 'nowrap'}}>
                Test Connection
              </button>
            </div>
            <span className="settings-field__hint">
              Your API key is encrypted with AES-256-GCM before being stored. It is never exposed in API responses.
            </span>
            {llmTestResult && (
              <span className={`settings-badge ${llmTestResult.success ? 'success' : 'error'}`} style={{alignSelf: 'flex-start', marginTop: '4px'}}>
                {llmTestResult.success ? '✅' : '❌'} {llmTestResult.message}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Section 2: Simulation Configuration */}
      <div className="settings-card">
        <div className="settings-card__header">
          <Server size={16} />
          <span className="settings-card__title">Simulation Configuration</span>
        </div>
        <div className="settings-card__body">
          <div className="settings-field">
            <label className="settings-field__label" htmlFor="log-ingestion-rate">Log Ingestion Rate</label>
            <div className="settings-slider-container">
              <span style={{fontSize: 'var(--text-label)', color: 'var(--text-muted)'}}>1/s</span>
              <input
                id="log-ingestion-rate"
                type="range"
                className="settings-slider"
                min="1"
                max="20"
                value={logsPerSecond}
                onChange={e => handleUpdateLogsPerSecond(parseInt(e.target.value))}
              />
              <span style={{fontSize: 'var(--text-label)', color: 'var(--text-muted)'}}>20/s</span>
              <span className="settings-slider__value">{logsPerSecond} logs/s</span>
            </div>
            <span className="settings-field__hint">
              Controls how many log events per second the simulator generates. Higher values create more realistic traffic but consume more resources.
            </span>
          </div>
        </div>
      </div>

      <aside className="settings-note"><ShieldCheck size={20} strokeWidth={1.4} /><div><h3>Built for deliberate experiments.</h3><p>Start with a modest event rate, introduce one scenario at a time, then follow its evidence through the incident lifecycle.</p></div></aside>

      {/* Section 3: Danger Zone */}
      <div className="settings-card danger-zone">
        <div className="settings-card__header">
          <XCircle size={16} color="var(--severity-p0)" />
          <span className="settings-card__title">Danger Zone</span>
        </div>
        <div className="settings-card__body">
          <div className="settings-field">
            <span className="settings-field__label">Factory Reset</span>
            <span className="settings-field__hint">
              This will permanently delete ALL incidents, logs, anomalies, and cached data. Kafka offsets will not be reset. This action cannot be undone.
            </span>
            {!showResetConfirm ? (
              <button className="btn-danger" onClick={() => setShowResetConfirm(true)} style={{alignSelf: 'flex-start'}}>
                🗑️ Reset All Data
              </button>
            ) : (
              <div className="settings-field__row">
                <span style={{fontSize: 'var(--text-label)', fontWeight: 600, color: 'var(--severity-p0)'}}>
                  Are you sure? This cannot be undone.
                </span>
                <button className="btn-danger" onClick={handleFactoryReset} disabled={resetting} style={{whiteSpace: 'nowrap'}}>
                  {resetting ? 'Resetting...' : 'Yes, Delete Everything'}
                </button>
                <button className="btn" onClick={() => setShowResetConfirm(false)} style={{whiteSpace: 'nowrap'}}>
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
    </>
  );

  // ─── Main Render ──────────────────────────────────────────────────────
  if (booting) {
    return <BootScreen onReady={() => setBooting(false)} />;
  }

  return (
    <div className="app-layout">
      {/* ─── Toasts ──────────────────────────────────────────────────── */}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.type}`}>
            {t.type === 'success' && '✅ '}
            {t.type === 'error' && '❌ '}
            {t.type === 'warning' && '⚠️ '}
            {t.type === 'info' && 'ℹ️ '}
            {t.message}
          </div>
        ))}
      </div>

      {/* ─── Global Sidebar (Left) ────────────────────────────────────── */}
      <div
        className={`sidebar-overlay ${isSidebarOpen ? 'open' : ''}`}
        onClick={() => setIsSidebarOpen(false)}
      ></div>
      <aside className={`sidebar ${isSidebarOpen ? 'open' : ''}`}>
        <div className="sidebar__brand">
          <BrandMark />
          <div className="sidebar__logo-text">
            <div className="sidebar__logo">Ultron AI</div>
            <div className="sidebar__subtitle">Detect. Decide. Resolve.</div>
          </div>
        </div>

        <nav className="sidebar__nav" aria-label="Main navigation"><span className="nav-section-label">WORKSPACE</span>
          <button type="button"
            aria-current={currentView === 'dashboard' ? 'page' : undefined}
            className={`nav-item ${currentView === 'dashboard' ? 'active' : ''}`}
            onClick={() => { setCurrentView('dashboard'); setIsSidebarOpen(false); }}
          >
            <BarChart2 className="icon" /> Dashboard
          </button>
          <button type="button"
            aria-current={currentView === 'incidents' ? 'page' : undefined}
            className={`nav-item ${currentView === 'incidents' ? 'active' : ''}`}
            onClick={() => { setCurrentView('incidents'); setIsSidebarOpen(false); }}
          >
            <AlertCircle className="icon" /> Incidents
          </button>
          <button type="button"
            aria-current={currentView === 'settings' ? 'page' : undefined}
            className={`nav-item ${currentView === 'settings' ? 'active' : ''}`}
            onClick={() => { setCurrentView('settings'); setIsSidebarOpen(false); }}
          >
            <Settings className="icon" /> Settings
          </button>
        </nav>

        <div className="sidebar__context"><div className="sidebar__context-label"><Cloud size={15} /> Cloud workspace</div><p>Telemetry to intelligence.<br />Powered by Google Cloud.</p></div>
        <div className="sidebar__footer">
          {simRunning ? (
            <button
              className="btn-simulate running"
              onClick={handleStopSimulation}
              id="simulate-btn"
            >
              <Square size={16} fill="currentColor" /> Stop Simulation
            </button>
          ) : (
            <button
              className="btn-simulate"
              onClick={handleSimulate}
              id="simulate-btn"
            >
              <Play size={16} fill="currentColor" /> Start Simulation
            </button>
          )}
          <div className="sidebar__footer-caption">On-demand telemetry simulation</div>
        </div>
      </aside>

      {/* ─── Main Workspace (Right) ────────────────────────────────────── */}
      <main className="workspace">

        {/* Top Header */}
        <header className="top-header">
          <div className="top-header__left">
            <button
              className="mobile-menu-btn"
              onClick={() => setIsSidebarOpen(true)}
              aria-label="Open Menu"
            >
              <Menu size={24} />
            </button>
            <div className="top-header__breadcrumb">Workspace <span>/</span></div>
            <h1 className="top-header__title">
              {currentView === 'dashboard' ? 'Overview' : currentView === 'settings' ? 'Settings' : 'Incidents'}
            </h1>
          </div>

          <div className="top-header__actions">
            <span className={`stream-status ${firestoreActive ? 'live' : ''}`} title={firestoreActive ? 'Incident updates connected through Firestore' : 'Dashboard uses periodic API updates'}><span className="status-dot" /><span>{firestoreActive ? 'Firestore live' : 'API updates'}</span></span>
            <button
              className={`mobile-sim-btn ${simRunning ? 'running' : ''}`}
              onClick={simRunning ? handleStopSimulation : handleSimulate}
              title={simRunning ? 'Stop Simulation' : 'Start Simulation'}
            >
              {simRunning ? (
                <><Square size={12} fill="currentColor" /> Stop</>
              ) : (
                <><Play size={12} fill="currentColor" /> Sim</>
              )}
            </button>
            <button className="theme-toggle" aria-label={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'} onClick={toggleTheme} title={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}>
              {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
            </button>
          </div>
        </header>

        {/* Scrollable Content Area */}
        <div className="content-area" key={currentView}>
          {currentView === 'dashboard' && renderDashboardView()}
          {currentView === 'incidents' && renderIncidentsView()}
          {currentView === 'settings' && renderSettingsView()}
        </div>
      </main>

      {/* ─── Manual Disposition Modal ────────────────────────────────── */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3 className="modal__title">Manual Triage Report</h3>

            <div className="modal__field">
              <label className="modal__label">Root Cause <span style={{color: '#ef4444'}}>*</span></label>
              <input className="modal__input" placeholder="e.g., DB_OUTAGE"
                value={modalForm.rootCause} onChange={e => setModalForm(p => ({...p, rootCause: e.target.value}))} />
            </div>
            <div className="modal__field">
              <label className="modal__label">RCA Summary <span style={{color: '#ef4444'}}>*</span></label>
              <textarea className="modal__textarea" placeholder="Brief summary of what happened..."
                value={modalForm.rcaSummary} onChange={e => setModalForm(p => ({...p, rcaSummary: e.target.value}))} />
            </div>
            <div className="modal__field">
              <label className="modal__label">Impact Analysis <span style={{color: '#ef4444'}}>*</span></label>
              <textarea className="modal__textarea" placeholder="Affected systems..."
                value={modalForm.impactAnalysis} onChange={e => setModalForm(p => ({...p, impactAnalysis: e.target.value}))} />
            </div>
            <div className="modal__field">
              <label className="modal__label">Suggested Fix <span style={{color: '#ef4444'}}>*</span></label>
              <textarea className="modal__textarea" placeholder="Steps to mitigate..."
                value={modalForm.suggestedFix} onChange={e => setModalForm(p => ({...p, suggestedFix: e.target.value}))} />
            </div>
            <div className="modal__field">
              <label className="modal__label">Prevention <span style={{color: '#ef4444'}}>*</span></label>
              <textarea className="modal__textarea" placeholder="Future prevention..."
                value={modalForm.prevention} onChange={e => setModalForm(p => ({...p, prevention: e.target.value}))} />
            </div>

            <div className="modal__actions">
              <button className="btn" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleManualDisposition}>Submit Report</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Eco-Mode / Session Paused Modal ─────────────────────────── */}
      {isIdle && (
        <div className="idle-overlay">
          <div className="idle-modal">
            <div className="idle-icon">🍃</div>
            <div className="idle-badge">Eco-Mode Active</div>
            <h2 className="idle-title">Session Paused</h2>
            <p className="idle-desc">
              You have been inactive for over 40 minutes. Background microservices were allowed to sleep to conserve free-tier cloud resources.
            </p>
            <button className="idle-btn" onClick={resumeSession}>
              <Play size={16} fill="currentColor" /> Resume Session
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
