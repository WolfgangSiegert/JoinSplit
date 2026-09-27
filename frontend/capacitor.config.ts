import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'org.tinybits.joinsplit',
  appName: 'JoinSplit',
  webDir: '.output/public',
  backgroundColor: '#fbf7ef',
  plugins: {
    CapacitorCookies: { enabled: true },
    CapacitorHttp: { enabled: true },
  },
}

export default config
