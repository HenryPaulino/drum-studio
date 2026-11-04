import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.henrypaulino.drumstudio',
  appName: 'Drum Studio',
  webDir: 'dist',
  ios: {
    contentInset: 'automatic',
  },
}

export default config
