import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@/styles/global.css'
import { ErrorBoundary } from '@/app/ErrorBoundary'
import { bootstrapSettings } from '@/app/settingsStore'
import { App } from './App'

bootstrapSettings()
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
)
