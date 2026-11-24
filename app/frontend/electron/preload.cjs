const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('errorMessenger', {
    apiBaseUrl: 'http://127.0.0.1:3001',
    appName: 'ERROR MESSENGER',
    version: '1.0.0'
});
