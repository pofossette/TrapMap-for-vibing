import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { Bootstrap } from './app/bootstrap';
import './shared/lib/fonts';
import './styles/index.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('TrapMap web panel root element was not found.');
}

createRoot(rootElement).render(
  <StrictMode>
    <Bootstrap />
  </StrictMode>,
);
