import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
console.log("AdGenie: Mounting React Root...");
try {
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
  console.log("AdGenie: Render called successfully.");
} catch (e) {
  console.error("AdGenie: Fatal Render Error", e);
}