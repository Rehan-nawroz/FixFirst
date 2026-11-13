import { createRoot } from 'react-dom/client';
import '../../src/styles/sidepanel.css';
import { App } from '../../src/components/App';
import { createRuntimeClient } from '../../src/shared/messaging/client';

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(<App client={createRuntimeClient()} />);
}
