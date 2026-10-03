import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

function App() {
  return <main>Dashboard placeholder. Tenant dashboard arrives in Phase 1.</main>;
}

const root = document.getElementById('root');
if (!root) {
  throw new Error('Root element #root not found');
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
