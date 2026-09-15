/**
 * React Native entry point for the Phase 0 native spike.
 *
 * @format
 */

import { AppRegistry } from 'react-native'
import App from './src/App'
import { name as appName } from './app.json'

AppRegistry.registerComponent(appName, () => App)
