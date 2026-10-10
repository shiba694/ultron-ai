export const INCIDENT_STATES = {
  NEW: 'New', ASSESSING: 'Assessing', RCA_COMPLETE: 'RCA Complete',
  AWAITING_TRIAGE: 'Awaiting Triage', IN_PROGRESS: 'In Progress',
  RESOLVED: 'Resolved', CLOSED: 'Closed',
};

export const hasAIAnalysis = incident => incident?.confidence > 0;
export const hasManualAnalysis = incident => !!incident?.manualRootCause || (
  incident?.confidence == null && !!incident?.rootCause &&
  ['RCA_COMPLETE', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'].includes(incident?.status)
);
export const showAIAnalysis = incident => incident?.confidence != null ||
  incident?.status === 'AWAITING_TRIAGE' || (
    ['IN_PROGRESS', 'RESOLVED', 'CLOSED'].includes(incident?.status) && !hasManualAnalysis(incident)
  );
