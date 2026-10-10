import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import App from './App';
import { api } from './api';

jest.mock('./api', () => ({
  api: {
    getIncidents: jest.fn(),
    getStats: jest.fn(),
    getHealth: jest.fn(),
    getSimulationStatus: jest.fn(),
    getChaosScenarios: jest.fn(),
    getChaosServices: jest.fn(),
    getApiKey: jest.fn(),
    getSimConfig: jest.fn(),
    getIncident: jest.fn(),
    getComments: jest.fn(),
    acceptIncident: jest.fn(),
    resolveIncident: jest.fn(),
    closeIncident: jest.fn(),
    generateResolution: jest.fn(),
    testLLM: jest.fn()
  },
  pingAPI: jest.fn().mockResolvedValue(true)
}));

// Mock BootScreen so App unit tests test the main dashboard
jest.mock('./BootScreen', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: function MockBootScreen({ onReady }) {
      React.useEffect(() => {
        if (onReady) onReady();
      }, [onReady]);
      return null;
    }
  };
});

jest.mock('./firebase', () => ({
  subscribeToIncidents: jest.fn(() => () => {}),
  clearFirestoreIncidents: jest.fn(),
}));

// Mock recharts to avoid rendering issues in JSDOM
jest.mock('recharts', () => {
  const Original = jest.requireActual('recharts');
  return {
    ...Original,
    ResponsiveContainer: ({ children }) => (
      <div style={{ width: 500, height: 300 }}>{children}</div>
    )
  };
});

describe('App', () => {
  beforeEach(() => {
    api.getIncidents.mockResolvedValue({
      content: [
        {
          incidentId: 'INC-123',
          incidentNumber: 'INC-123',
          title: 'Database connection failed',
          severity: 'P1',
          status: 'RCA_COMPLETE',
          serviceName: 'user-service',
          description: 'Cannot connect to postgres',
          createdAt: new Date().toISOString()
        }
      ],
      totalElements: 1
    });
    api.getStats.mockResolvedValue({
      totalIncidents: 10,
      awaitingTriageCount: 1,
      inProgressCount: 2,
      resolvedIncidents: 1,
      closedCount: 1,
      openIncidents: 1,
      avgResolutionTime: 120,
      uptime: 99.9,
      totalAnomalies: 20
    });
    api.getHealth.mockResolvedValue({
      status: 'UP',
      components: {
        'user-service': { status: 'UP' }
      }
    });
    api.getSimulationStatus.mockResolvedValue({ active: false });
    api.getChaosScenarios.mockResolvedValue([{ id: 'latency', label: 'Latency' }]);
    api.getChaosServices.mockResolvedValue(['user-service']);
    api.getApiKey.mockResolvedValue({ maskedKey: '****' });
    api.getSimConfig.mockResolvedValue({ logsPerSecond: 5 });
    api.getComments.mockResolvedValue([]);
  });

  afterEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
  });

  test('renders dashboard and fetches data', async () => {
    render(<App />);
    
    // Check if the title is present
    expect(screen.getByText('Ultron AI')).toBeInTheDocument();
    
    // Check stats are rendered on the dashboard
    await waitFor(() => {
      expect(screen.getByText('10')).toBeInTheDocument(); // total incidents
    });
  });

  test('navigates to incidents view and shows incidents', async () => {
    render(<App />);

    // Click on Incidents navigation item
    const navItems = screen.getAllByText(/Incidents/i);
    const incidentsNav = navItems.find(el => el.classList && el.classList.contains('nav-item'));
    if (incidentsNav) {
      fireEvent.click(incidentsNav);
    }

    // Wait for the incidents to be loaded
    await waitFor(() => {
      expect(screen.getByText('Database connection failed')).toBeInTheDocument();
    });
  });

  test('filters the loaded queue and restores it when search is cleared', async () => {
    render(<App />);
    await screen.findByText('Database connection failed');
    fireEvent.click(screen.getByRole('button', { name: 'Incidents', exact: true }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Search incidents' }), { target: { value: 'no-matching-service' } });
    expect(screen.getByText('No incidents match your search.')).toBeInTheDocument();
    expect(screen.queryByText('Database connection failed')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(screen.getByText('Database connection failed')).toBeInTheDocument();
  });

  test('switches themes and persists the selected mode', async () => {
    localStorage.setItem('ultron-theme', 'dark');
    render(<App />);
    const toggle = await screen.findByRole('button', { name: 'Switch to Light Mode' });
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    fireEvent.click(toggle);
    expect(document.documentElement).toHaveAttribute('data-theme', 'light');
    expect(localStorage.getItem('ultron-theme')).toBe('light');
    fireEvent.click(screen.getByRole('button', { name: 'Switch to Dark Mode' }));
    expect(localStorage.getItem('ultron-theme')).toBe('dark');
  });

  test('keeps all chaos scenarios disabled while simulation is stopped', async () => {
    render(<App />);
    await screen.findByRole('button', { name: 'Start Simulation' });
    expect(await screen.findByRole('button', { name: 'Latency' })).toBeDisabled();
  });

  test('counts all nonterminal incidents as active, including analyzed incidents', async () => {
    render(<App />);
    await screen.findByText('10');
    const card = screen.getByText('Active Incidents').closest('.metric-card');
    expect(card.querySelector('.metric-card__value')).toHaveTextContent('8');
    expect(screen.getByText('Completed').closest('.metric-card').querySelector('.metric-card__value')).toHaveTextContent('2');
  });

  test('renders usable, labeled settings controls', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Settings', exact: true }));
    const keyInput = screen.getByLabelText('OpenRouter API Key');
    expect(keyInput).toHaveAttribute('type', 'password');
    fireEvent.change(keyInput, { target: { value: 'preview-key' } });
    expect(screen.getByRole('button', { name: 'Save Key' })).toBeEnabled();
    expect(await screen.findByRole('slider', { name: 'Log Ingestion Rate' })).toHaveValue('5');
  });

  test.each([
    ['NEW', ['AI is analyzing this incident...'], false],
    ['ASSESSING', ['AI is analyzing this incident...'], false],
    ['AWAITING_TRIAGE', ['Retry AI Analysis', 'Manual Triage', 'Accept & Work', 'Dismiss'], true],
    ['RCA_COMPLETE', ['Manual Triage', 'Accept & Work', 'Dismiss'], true],
    ['IN_PROGRESS', ['Manual Triage', 'Resolve', 'Dismiss'], true],
    ['RESOLVED', ['Manual Triage', 'Close Incident'], true],
    ['CLOSED', ['Manual Triage'], false],
  ])('shows the correct workflow actions and notes for %s', async (status, actions, canWriteNotes) => {
    const incident = { incidentId: 'workflow-1', incidentNumber: 'INC-001', title: 'Workflow incident', status, severity: 'P1', serviceName: 'order-service', confidence: .89 };
    api.getIncidents.mockResolvedValue({ content: [incident] });
    api.getIncident.mockResolvedValue(incident);
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /INC-001 Workflow incident/ }));
    const record = await screen.findByRole('region', { name: 'Incident record' });
    expect(within(record).getByLabelText('Configuration item')).toHaveValue('order-service');
    expect(within(record).getByLabelText('Priority')).toHaveValue('2 - High');
    expect(within(record).getByLabelText('Short description')).toHaveValue('Workflow incident');
    const bar = record.closest('.detail-panel').querySelector('.action-bar');
    for (const action of actions) expect(bar).toHaveTextContent(action);
    const allActions = ['Retry AI Analysis', 'Accept & Work', 'Resolve', 'Close Incident', 'Dismiss'];
    for (const action of allActions.filter(name => !actions.includes(name))) expect(within(bar).queryByRole('button', { name: new RegExp(action) })).not.toBeInTheDocument();
    expect(!!screen.queryByRole('textbox', { name: 'Work note' })).toBe(canWriteNotes);
    const stages = screen.getByRole('list', { name: 'Process stages' });
    expect(stages.querySelector('[aria-current="step"]')).toHaveTextContent({NEW:'New',ASSESSING:'Assess',AWAITING_TRIAGE:'Root Cause Analysis',RCA_COMPLETE:'Root Cause Analysis',IN_PROGRESS:'Fix in Progress',RESOLVED:'Resolved',CLOSED:'Closed'}[status]);
    if (status === 'AWAITING_TRIAGE') expect(stages.querySelector('[aria-current="step"]')).toHaveClass('warning');
    if (status === 'CLOSED') expect(stages.querySelectorAll('.completed')).toHaveLength(0);
  });

  test('keeps AI and manual reports separately available', async () => {
    const incident = {incidentId:'dual-1',incidentNumber:'INC-DUAL',title:'Dual analysis',status:'IN_PROGRESS',severity:'P2',confidence:.8,rootCause:'AI finding',manualRootCause:'Human finding'};
    api.getIncidents.mockResolvedValue({content:[incident]});
    api.getIncident.mockResolvedValue(incident);
    render(<App />);
    fireEvent.click(await screen.findByRole('button', {name:/INC-DUAL Dual analysis/}));
    fireEvent.click(await screen.findByRole('button', {name:'AI Analysis',exact:true}));
    expect(screen.getByText('AI finding')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', {name:'Manual Analysis',exact:true}));
    expect(screen.getByText('Human finding')).toBeInTheDocument();
    expect(screen.getByRole('button', {name:'Resolve',exact:true})).toBeInTheDocument();
  });

  test.each([null, 0])('accepts triage without inventing an analysis report (confidence %s)', async confidence => {
    let incident = {incidentId:'triage-1',incidentNumber:'INC-TRIAGE',title:'Unavailable AI',status:'AWAITING_TRIAGE',severity:'P2',confidence,rootCause:confidence === 0 ? 'UNKNOWN' : null};
    api.getIncidents.mockImplementation(async () => ({content:[incident]}));
    api.getIncident.mockImplementation(async () => incident);
    api.acceptIncident.mockImplementation(async () => (incident = {...incident,status:'IN_PROGRESS'}));
    render(<App />);
    fireEvent.click(await screen.findByRole('button', {name:/INC-TRIAGE Unavailable AI/}));
    const accept = await screen.findByRole('button', {name:'Accept & Work'});
    fireEvent.click(accept);
    await waitFor(() => expect(screen.getByLabelText('State')).toHaveValue('In Progress'));
    expect(api.acceptIncident).toHaveBeenCalledWith('triage-1');
    expect(screen.getByLabelText('Analysis source')).toHaveValue('No analysis report');
    expect(screen.queryByRole('button', {name:'Manual Analysis',exact:true})).not.toBeInTheDocument();
    const rcaStage = within(screen.getByRole('list', {name:'Process stages'})).getByText('Root Cause Analysis').closest('li');
    expect(rcaStage).toHaveClass('warning');
    expect(rcaStage).not.toHaveClass('completed');
    fireEvent.click(screen.getByRole('button', {name:'AI Analysis',exact:true}));
    expect(screen.getByText(/Work can continue without an AI report/)).toBeInTheDocument();
    expect(screen.getByRole('button', {name:'Resolve',exact:true})).toBeInTheDocument();
  });

  test('runs accept, resolve, and close through the existing lifecycle API', async () => {
    let incident = {incidentId:'flow-1',incidentNumber:'INC-FLOW',title:'Lifecycle incident',status:'RCA_COMPLETE',severity:'P2',confidence:.8};
    api.getIncidents.mockImplementation(async () => ({content:[incident]}));
    api.getIncident.mockImplementation(async () => incident);
    api.acceptIncident.mockImplementation(async () => (incident = {...incident,status:'IN_PROGRESS'}));
    api.resolveIncident.mockImplementation(async () => (incident = {...incident,status:'RESOLVED',mttrSeconds:120}));
    api.closeIncident.mockImplementation(async () => (incident = {...incident,status:'CLOSED'}));
    render(<App />);
    fireEvent.click(await screen.findByRole('button', {name:/INC-FLOW Lifecycle incident/}));
    fireEvent.click(await screen.findByRole('button', {name:'Accept & Work'}));
    await waitFor(() => expect(screen.getByRole('button', {name:/INC-FLOW Lifecycle incident/})).toHaveTextContent('In progress'));
    fireEvent.click(await screen.findByRole('button', {name:'Resolve',exact:true}));
    await waitFor(() => expect(screen.getByRole('button', {name:/INC-FLOW Lifecycle incident/})).toHaveTextContent('Resolved'));
    fireEvent.click(await screen.findByRole('button', {name:/Close Incident/}));
    await waitFor(() => expect(screen.getByLabelText('State')).toHaveValue('Closed'));
    expect(api.acceptIncident).toHaveBeenCalledWith('flow-1');
    expect(api.resolveIncident).toHaveBeenCalledWith('flow-1');
    expect(api.closeIncident).toHaveBeenCalledWith('flow-1');
    await waitFor(() => expect(screen.getByRole('button', {name:/INC-FLOW Lifecycle incident/})).toHaveTextContent('Closed'));
    expect(screen.queryByRole('textbox', {name:'Work note'})).not.toBeInTheDocument();
  });
});
