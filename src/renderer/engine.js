import { createNanoEvents } from 'nanoevents';
import { Buffer } from 'buffer';
import * as http from 'http';

const bodyPix = require('@tensorflow-models/body-pix');

export class Engine {
  constructor(store) {
    this.store = store;
    this.initialized = false;
    this.emitter = createNanoEvents();
    this.activeListeners = 0;
  }

  async initialize() {
    this.net = await bodyPix.load({
      architecture: this.store.get('bodyPix.architecture'),
      outputStride: this.store.get('bodyPix.outputStride'),
      multiplier: this.store.get('bodyPix.multiplier'),
      quantBytes: this.store.get('bodyPix.quantBytes'),
    });

    this.videoElement = document.createElement('video');
    await this.loadVideo(null, this.videoElement);
    this.canvas = document.createElement('canvas');
    this.canvasContext = this.canvas.getContext('2d');

    this.narrator = document.createElement('canvas');
    this.narratorContext = this.narrator.getContext('2d');

    document.querySelector('body').append(this.narrator);

    http
      .createServer((req, res) => this.handleRequest(req, res))
      .listen(this.store.get('httpListenerPort'));
  }

  handleRequest(req, res) {
    const _this = this;

    _this.activeListeners++;

    res.writeHead(200, {
      'Content-Type': 'multipart/x-mixed-replace; boundary=myboundary',
      'Cache-Control': 'no-cache',
      Connection: 'close',
      Pragma: 'no-cache',
    });

    function blobToBuffer(blob, callback) {
      const reader = new FileReader();

      reader.addEventListener(
        'loadend',
        (event) => {
          if (event.error) {
            callback(event.error);
          } else {
            callback(null, new Buffer(reader.result));
          }

          reader.removeEventListener('loadend', blobToBuffer, false);
        },
        false
      );

      reader.readAsArrayBuffer(blob);
      return reader;
    }

    const unbind = this.emitter.on('frame', () => {
      setTimeout(function () {
        _this.canvas.toBlob(
          (data) => {
            blobToBuffer(data, function (_, data) {
              res.write('--myboundary\r\n');
              res.write('Content-Type: image/jpeg\r\n');
              res.write('Content-Length: ' + data.length + '\r\n');
              res.write('\r\n');
              res.write(data, 'binary');
              res.write('\r\n');
            });
          },
          'image/jpeg',
          _this.store.get('mjpegJpegQuality')
        );
      }, 1);
    });

    res.on('close', function () {
      _this.activeListeners--;
      unbind();
      res.end();
    });
  }

  async estimateSegmentation() {
    return await this.net.segmentPerson(this.videoElement, {
      internalResolution: this.store.get('bodyPix.internalResolution'),
      segmentationThreshold: this.store.get('bodyPix.segmentationThreshold'),
      maxDetections: this.store.get('bodyPix.maxDetections'),
      scoreThreshold: this.store.get('bodyPix.scoreThreshold'),
      nmsRadius: this.store.get('bodyPix.nmsRadius'),
    });
  }

  async run() {
    const _this = this;

    let lastTime = this.videoElement.currentTime;
    let segmentation = null;

    async function run() {
      segmentation = await _this.estimateSegmentation();
      setTimeout(run, 0);
    }

    async function frame() {
      var time = _this.videoElement.currentTime;
      if (time !== lastTime) {
        lastTime = time;
      }

      if (segmentation) {
        bodyPix.drawBokehEffect(
          _this.canvas,
          _this.videoElement,
          segmentation,
          10,
          18,
          false
        );

        // TODO: if in foreground for presenter mode
        const foreground = {
          r: 0,
          g: 0,
          b: 0,
          a: 0,
        };
        const background = {
          r: 0,
          g: 0,
          b: 0,
          a: 0,
        };

        _this.narrator.width = segmentation.width;
        _this.narrator.height = segmentation.height;

        var imageData = _this.canvasContext.getImageData(
          0,
          0,
          _this.narrator.width,
          _this.narrator.height
        );

        const bytes = new Uint8ClampedArray(
          segmentation.width * segmentation.height * 4
        );

        for (let i = 0; i < segmentation.height; i += 1) {
          for (let j = 0; j < segmentation.width; j += 1) {
            const n = i * segmentation.width + j;
            bytes[4 * n + 0] = background.r;
            bytes[4 * n + 1] = background.g;
            bytes[4 * n + 2] = background.b;
            bytes[4 * n + 3] = background.a;

            if (segmentation.data[n] == 1) {
              bytes[4 * n] = imageData.data[4 * n];
              bytes[4 * n + 1] = imageData.data[4 * n + 1];
              bytes[4 * n + 2] = imageData.data[4 * n + 2];
              bytes[4 * n + 3] = imageData.data[4 * n + 3];
            }
          }
        }

        _this.narratorContext.putImageData(
          new ImageData(bytes, segmentation.width, segmentation.height),
          0,
          0
        );
      }

      _this.emitter.emit('frame');
      setTimeout(frame, 0);
    }

    frame();
    run();
  }

  async getVideoInputs() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      console.log('enumerateDevices() not supported.');
      return [];
    }

    const devices = await navigator.mediaDevices.enumerateDevices();

    const videoDevices = devices.filter(
      (device) => device.kind === 'videoinput'
    );

    return videoDevices;
  }

  stopExistingVideoCapture() {
    if (this.videoElement && this.videoElement.srcObject) {
      this.videoElement.srcObject.getTracks().forEach((track) => {
        track.stop();
      });
      this.videoElement.srcObject = null;
    }
  }

  async getDeviceIdForLabel(cameraLabel) {
    const videoInputs = await this.getVideoInputs();

    for (let i = 0; i < videoInputs.length; i++) {
      const videoInput = videoInputs[i];
      if (videoInput.label === cameraLabel) {
        return videoInput.deviceId;
      }
    }

    return null;
  }

  getFacingMode(cameraLabel) {
    if (!cameraLabel) {
      return 'user';
    }
    if (cameraLabel.toLowerCase().includes('back')) {
      return 'environment';
    } else {
      return 'user';
    }
  }

  async getConstraints(cameraLabel) {
    let deviceId;
    let facingMode;

    if (cameraLabel) {
      deviceId = await getDeviceIdForLabel(cameraLabel);
      // on mobile, use the facing mode based on the camera.
      facingMode = isMobile() ? getFacingMode(cameraLabel) : null;
    }
    return { deviceId, facingMode };
  }

  async setupCamera(cameraLabel) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error(
        'Browser API navigator.mediaDevices.getUserMedia not available'
      );
    }

    this.stopExistingVideoCapture();

    const videoConstraints = await this.getConstraints(cameraLabel);

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: videoConstraints,
    });
    this.videoElement.srcObject = stream;

    return new Promise((resolve) => {
      this.videoElement.onloadedmetadata = () => {
        this.videoElement.width = this.videoElement.videoWidth;
        this.videoElement.height = this.videoElement.videoHeight;
        resolve(this.videoElement);
      };
    });
  }

  async loadVideo(cameraLabel) {
    try {
      this.videoElement = await this.setupCamera(cameraLabel);
      this.videoElement.play();

      return this.videoElement;
    } catch (e) {
      throw e;
    }
  }
}
