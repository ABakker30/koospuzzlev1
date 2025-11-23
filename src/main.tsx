import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import { AuthProvider } from './auth/AuthContext.tsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  // StrictMode disabled temporarily - causes SceneCanvas pieces to disappear on double-mount
  // <React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  // </React.StrictMode>,
)
