import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { FlagsProvider } from './config/FlagsProvider';
import { AuthProvider } from './auth/AuthProvider';
import './index.css';

(window as any).gm_authFailure = () => {
  window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
};
const origError = console.error;
console.error = (...args: unknown[]) => {
  origError.apply(console, args);
  const msg = args.map((a) => String(a)).join(' ');
  if (msg.includes('OverQuotaMapError') || msg.includes('QuotaExceededError')) {
    window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
  }
};

createRoot(document.getElementById('root')!).render(
  <FlagsProvider>
    <AuthProvider>
      <App />
    </AuthProvider>
  </FlagsProvider>
);

