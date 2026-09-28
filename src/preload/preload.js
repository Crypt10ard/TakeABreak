'use strict';

const { contextBridge, ipcRenderer } = require('electron');

function subscribe(channel, callback) {
  const handler = (_event, data) => callback(data);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

// The only surface the pages get: plain data in, named actions out.
contextBridge.exposeInMainWorld('atem', {
  platform: process.platform,
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
  getState: () => ipcRenderer.invoke('state:get'),
  getStats: () => ipcRenderer.invoke('stats:get'),
  getBreak: () => ipcRenderer.invoke('break:get'),
  getInfo: () => ipcRenderer.invoke('app:info'),
  action: (name, payload) => ipcRenderer.invoke('action', name, payload),
  onState: (callback) => subscribe('state', callback),
  onSettings: (callback) => subscribe('settings', callback),
  onEvent: (callback) => subscribe('event', callback),
});
