import { Activity, BrainCircuit, CheckCircle2, ScanLine } from 'lucide-react';

// A lightweight, code-native illustration of the Ultron incident workflow.
export default function CommandVisual({ running = false }) {
  return (
    <div className={`command-visual ${running ? 'is-running' : ''}`} aria-label="Ultron incident workflow: detect, decide, resolve">
      <div className="command-visual__grid" aria-hidden="true" />
      <div className="command-visual__orbit orbit-one" aria-hidden="true" />
      <div className="command-visual__orbit orbit-two" aria-hidden="true" />
      <div className="command-visual__core"><ScanLine size={32} strokeWidth={1.4} /><span>ULTRON</span></div>
      <div className="pipeline-node node-detect"><Activity size={18} /><span>Detect</span><i /></div>
      <div className="pipeline-node node-decide"><BrainCircuit size={18} /><span>Decide</span><i /></div>
      <div className="pipeline-node node-resolve"><CheckCircle2 size={18} /><span>Resolve</span><i /></div>
      <span className="command-visual__caption">DETECT → DECIDE → RESOLVE</span>
    </div>
  );
}
