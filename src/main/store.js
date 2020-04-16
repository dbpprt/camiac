const Store = require('electron-store');

// const schema = {
//   presenter: {
//     type: 'object',
//     properties: {
//       globalShortcut: { type: 'string', default: '' },
//       width: { type: 'number', default: 640 },
//       height: { type: 'number', default: 480 },
//     },
//   },
// };

export const store = new Store({
  configName: 'user-preferences',
  defaults: {
    httpListenerPort: 8081,
    mjpegJpegQuality: 0.8,
    presenter: {
      width: 640,
      height: 480,
      globalShortcut: 'CommandOrControl+Y',
    },
    bodyPix: {
      architecture: 'MobileNetV1',
      outputStride: 16,
      multiplier: 0.75,
      quantBytes: 2,
      internalResolution: 'medium',
      segmentationThreshold: 0.4,
      maxDetections: 1,
      scoreThreshold: 0.8,
      nmsRadius: 10,
    },
  },
});
