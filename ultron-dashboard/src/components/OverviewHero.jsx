import { ArrowUpRight, Radio, Sparkles } from 'lucide-react';
import CommandVisual from './CommandVisual';

export default function OverviewHero({ running, onViewIncidents }) {
  return (
    <section className="overview-hero">
      <div className="overview-hero__copy">
        <div className="eyebrow"><Sparkles size={13} /> ULTRON AI · INCIDENT INTELLIGENCE</div>
        <h2>Your systems.<br /><span>In sharper focus.</span></h2>
        <p>Follow the signal from anomaly to root cause.<br className="hero-line-break" /> Everything you need to investigate, in one place.</p>
        <div className="overview-hero__actions">
          <button className="btn btn-primary" onClick={onViewIncidents}>Explore incidents <ArrowUpRight size={16} /></button>
          <span className={`hero-state ${running ? 'running' : ''}`}><Radio size={14} /> {running ? 'Simulation streaming' : 'Simulation on standby'}</span>
        </div>
      </div>
      <CommandVisual running={running} />
    </section>
  );
}
