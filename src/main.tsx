import React from 'react';
import ReactDOM from 'react-dom/client';
import { PreferencesProvider } from './preferences';
import { IconFamily } from './App';
import 'antd/dist/reset.css';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PreferencesProvider>
      <IconFamily />
    </PreferencesProvider>
  </React.StrictMode>,
);
