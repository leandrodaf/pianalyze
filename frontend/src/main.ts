import './style.css'
import { mount } from 'svelte'
import App from './App.svelte'
import { initSentry } from './lib/sentry'

// Must be called before mounting so Sentry's global error handlers are in place
// before any component code runs.
initSentry()

const app = mount(App, { target: document.getElementById('app')! })

export default app
