/**
 * Point 3: write a plugin bundle to disk, read it back at runtime, evaluate it
 * inside the running app, and register its component into a slot.
 */

import React from 'react'
import { Text, View } from 'react-native'
import { PLUGIN_BUNDLE_PATH } from './config.ts'
import { readTextFile, trace, writeTextFile } from '../host/DshHost.ts'
import { registerSlot, type SlotComponent } from '../slots/slotRegistry.ts'

const BUNDLE_TEMPLATE = `exports.Component = function RuntimeLoadedPlugin() {
  log('plugin render: typeof React=' + typeof React + ' View=' + typeof View + ' Text=' + typeof Text);
  return React.createElement(View, { style: { padding: 12, backgroundColor: '#16283a', borderRadius: 6 } },
    React.createElement(Text, { style: { color: '#8fe3c0', fontWeight: '600' } }, 'Runtime plugin component'),
    React.createElement(Text, { style: { color: '#9aa4ad', fontSize: 11 } }, 'evaluated from __PLUGIN_FILE__'))
}
`

interface BundleModule {
  exports: { Component?: SlotComponent }
}

/** Write, reload, evaluate, and register the sample plugin bundle. */
export async function loadPluginBundle(): Promise<string> {
  const source = BUNDLE_TEMPLATE.replace('__PLUGIN_FILE__', JSON.stringify(PLUGIN_BUNDLE_PATH))
  await trace('plugin: writing bundle')
  await writeTextFile(PLUGIN_BUNDLE_PATH, source)
  await trace('plugin: reading bundle back')
  const code = await readTextFile(PLUGIN_BUNDLE_PATH)
  await trace(`plugin: read ${String(code.length)} chars, evaluating`)
  const log = (message: string): void => { void trace(message) }
  const bundleModule: BundleModule = { exports: {} }
  const factory = new Function('React', 'View', 'Text', 'log', 'module', 'exports', code) as (
    react: typeof React,
    view: typeof View,
    text: typeof Text,
    log: (message: string) => void,
    module: BundleModule,
    exports: BundleModule['exports'],
  ) => void
  await trace('plugin: function constructed')
  factory(React, View, Text, log, bundleModule, bundleModule.exports)
  await trace('plugin: factory executed')
  const component = bundleModule.exports.Component
  if (component === undefined) {
    throw new Error('plugin bundle exported no Component')
  }
  await trace(`plugin: component typeof=${typeof component}`)
  registerSlot('plugin.slot', component)
  await trace('plugin: slot registered')
  return PLUGIN_BUNDLE_PATH
}
