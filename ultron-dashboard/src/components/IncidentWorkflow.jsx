import { Check, GitBranch, Info, AlertCircle } from 'lucide-react';

import { INCIDENT_STATES, hasAIAnalysis, hasManualAnalysis } from './incidentStates';
const STAGES = ['NEW', 'ASSESSING', 'RCA_COMPLETE', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];
const STAGE_LABELS = ['New', 'Assess', 'Root Cause Analysis', 'Fix in Progress', 'Resolved', 'Closed'];
const GUIDANCE = {
  NEW: ['Incident detected', 'The incident and its evidence have been created. Analysis runs automatically; a cached result may move it directly to RCA Complete.'],
  ASSESSING: ['Assessment in progress', 'Ultron is analyzing the evidence. A valid result moves this incident to RCA Complete; unavailable or invalid analysis moves it to Awaiting Triage.'],
  AWAITING_TRIAGE: ['AI analysis unavailable · ready for an analyst decision', 'Retry AI Analysis, add a manual triage report, or Accept & Work to investigate without an AI report. Dismiss closes the incident directly.'],
  RCA_COMPLETE: ['Analysis is ready for review', 'Review the AI or manual findings, then Accept & Work to begin the fix. You can add manual analysis or dismiss the incident.'],
  IN_PROGRESS: ['The fix is in progress', 'Document the investigation in Work Notes. Resolve after the fix is complete to record the resolution time and MTTR, or dismiss to close directly.'],
  RESOLVED: ['Resolved, awaiting closure', 'Resolution time and MTTR have been recorded. Close Incident completes the workflow. Editing manual analysis keeps this incident resolved.'],
  CLOSED: ['Incident closed', 'This is the terminal state. Work Notes are read-only. Manual analysis can still be added or edited without reopening the incident.'],
};

export default function IncidentWorkflow({ incident }) {
  const triage = incident.status === 'AWAITING_TRIAGE';
  const current = triage ? 2 : STAGES.indexOf(incident.status);
  // Dismissal closes directly; the API does not expose a full transition history.
  const closed = incident.status === 'CLOSED';
  const analysisMissing = current > 2 && !hasAIAnalysis(incident) && !hasManualAnalysis(incident);
  const [title, explanation] = GUIDANCE[incident.status] || ['Incident state', 'Review the available incident evidence.'];
  return (
    <section className="sn-workflow" aria-label="Incident workflow">
      <div className="sn-workflow__heading"><span><GitBranch size={14} /> Incident lifecycle</span><span className={`badge badge-${incident.status?.toLowerCase().replaceAll('_', '-')}`}>{INCIDENT_STATES[incident.status] || incident.status}</span></div>
      <ol className="sn-process-flow" aria-label="Process stages">
        {STAGES.map((stage, index) => (
          <li key={stage} className={`sn-flow-step ${!closed && index < current && !(analysisMissing && index === 2) ? 'completed' : ''} ${(triage || analysisMissing) && index === 2 ? 'warning' : index === current ? 'active' : ''}`} aria-current={index === current ? 'step' : undefined}>
            <span className="sn-flow-step__number">{(triage || analysisMissing) && index === 2 ? <AlertCircle size={12} /> : !closed && index < current ? <Check size={12} /> : index + 1}</span>
            <span>{STAGE_LABELS[index]}</span>
          </li>
        ))}
      </ol>
      <div className={`sn-stage-guidance ${triage ? 'warning' : ''}`} role="status">
        {triage ? <AlertCircle size={18} /> : <Info size={18} />}
        <div><strong>{title}</strong><p>{explanation}</p>{triage && <span className="sn-branch-note">Retry → Assessing · Manual report → RCA Complete · Accept & Work → In Progress · Dismiss → Closed</span>}{analysisMissing && !closed && <span className="sn-branch-note">No AI or manual report yet. Investigation can continue; add manual triage when findings are available.</span>}</div>
      </div>
    </section>
  );
}
