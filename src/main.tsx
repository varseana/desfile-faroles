import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Fuentes self-hosted (no dependen de Google en el evento):
// Fraunces (display, con alma) para titulos, Hanken Grotesk (sans limpia) para UI.
import '@fontsource-variable/fraunces/full.css'
import '@fontsource-variable/hanken-grotesk'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
