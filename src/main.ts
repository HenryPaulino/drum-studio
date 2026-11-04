
import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'

// Importa os estilos globais
import './styles/global.css'

const app = createApp(App)

app.use(createPinia())

app.mount('#app')
