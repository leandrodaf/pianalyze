import './style.css'
import { mount } from 'svelte'
import App from './App.svelte'
import { initErrorHandlers } from './lib/sentry'

// Must run before mount so global error handlers are active before any
// component code executes.
initErrorHandlers()

const app = mount(App, { target: document.getElementById('app')! })

export default app
