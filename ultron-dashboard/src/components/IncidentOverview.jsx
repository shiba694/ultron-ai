import { ClipboardList, Clock3 } from 'lucide-react';
import { INCIDENT_STATES, hasAIAnalysis, hasManualAnalysis } from './incidentStates';

function RecordField({ label, value, mono = false }) {
  const id = `incident-field-${label.toLowerCase().replaceAll(' ', '-')}`;
  return <div className="sn-form-group"><label className="sn-label" htmlFor={id}>{label}</label><div className="sn-field-value"><input id={id} className={`sn-input sn-readonly ${mono ? 'mono' : ''}`} value={value ?? '—'} readOnly /></div></div>;
}

export default function IncidentOverview({ incident, formatDate, formatMTTR }) {
  const impact = ['P0', 'P1'].includes(incident.severity) ? '1 - High' : incident.severity === 'P2' ? '2 - Medium' : incident.severity === 'P3' ? '3 - Low' : '—';
  const priority = { P0: '1 - Critical', P1: '2 - High', P2: '3 - Moderate', P3: '4 - Low' }[incident.severity] || incident.severity;
  const hasManual = hasManualAnalysis(incident);
  const hasAI = hasAIAnalysis(incident);
  const analysis = incident.status === 'AWAITING_TRIAGE' ? 'AI unavailable · triage needed' : hasAI && hasManual ? 'AI + manual triage' : hasManual ? 'Manual triage' : hasAI ? 'AI analysis' : ['IN_PROGRESS', 'RESOLVED', 'CLOSED'].includes(incident.status) ? 'No analysis report' : 'Pending';
  return (
    <section className="sn-form-container" aria-label="Incident record">
      <div className="sn-header-bar"><div><ClipboardList size={17} /><h3>Incident record</h3></div><span className="panel-caption">{incident.incidentNumber || 'INC-NEW'}</span></div>
      <div className="sn-form-body">
        <div className="sn-form-grid">
          <div className="sn-form-col">
            <RecordField label="Number" value={incident.incidentNumber || 'INC-NEW'} mono />
            <RecordField label="Caller" value="Ultron Detector" />
            <RecordField label="Category" value="Software" />
            <RecordField label="Subcategory" value="Microservice" />
            <RecordField label="Configuration item" value={incident.serviceName} mono />
            <RecordField label="Analysis source" value={analysis} />
          </div>
          <div className="sn-form-col">
            <RecordField label="State" value={INCIDENT_STATES[incident.status] || incident.status} />
            <RecordField label="Impact" value={impact} />
            <RecordField label="Urgency" value={impact} />
            <RecordField label="Priority" value={priority} />
            <RecordField label="Assignment group" value={incident.assignmentGroup || 'Not assigned'} />
            <RecordField label="Assigned to" value={incident.assignedTo || 'Not assigned'} />
          </div>
        </div>
        <p className="sn-record-note">Impact and urgency are derived from severity.</p>
        <div className="sn-form-full">
          <RecordField label="Short description" value={incident.title} />
          <div className="sn-form-group"><label className="sn-label" htmlFor="incident-description">Description</label><textarea id="incident-description" className="sn-textarea" readOnly value={incident.description || `Automated incident created by Ultron AI following an anomaly in ${incident.serviceName || 'the affected service'}.\n\nSource Anomaly ID: ${incident.anomalyId || 'Not available'}\nDetected At: ${formatDate(incident.detectedAt)}\nAnalyzed At: ${formatDate(incident.analyzedAt)}`} /></div>
        </div>
        <div className="sn-timestamps" aria-label="Incident timestamps">
          <div><Clock3 size={14} /><span>Detected<strong>{formatDate(incident.detectedAt)}</strong></span></div>
          <div><Clock3 size={14} /><span>Analyzed<strong>{formatDate(incident.analyzedAt)}</strong></span></div>
          <div><Clock3 size={14} /><span>Resolution / dismissal<strong>{formatDate(incident.resolvedAt)}</strong></span></div>
          <div><Clock3 size={14} /><span>MTTR<strong>{incident.mttrSeconds != null ? formatMTTR(incident.mttrSeconds) : 'Not recorded'}</strong></span></div>
        </div>
      </div>
    </section>
  );
}
