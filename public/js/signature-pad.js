class SignaturePad {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.drawing = false;
    this.lastX = 0;
    this.lastY = 0;
    this.paths = [];
    this.currentPath = [];

    this.setupCanvas();
    this.bindEvents();
  }

  setupCanvas() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;

    this.ctx.scale(dpr, dpr);
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    this.ctx.lineWidth = 2;
    this.ctx.strokeStyle = '#000';

    this.canvasWidth = rect.width;
    this.canvasHeight = rect.height;
  }

  bindEvents() {
    // Mouse events
    this.canvas.addEventListener('mousedown', (e) => this.startDrawing(e));
    this.canvas.addEventListener('mousemove', (e) => this.draw(e));
    this.canvas.addEventListener('mouseup', () => this.stopDrawing());
    this.canvas.addEventListener('mouseout', () => this.stopDrawing());

    // Touch events
    this.canvas.addEventListener('touchstart', (e) => this.handleTouchStart(e));
    this.canvas.addEventListener('touchmove', (e) => this.handleTouchMove(e));
    this.canvas.addEventListener('touchend', () => this.stopDrawing());

    // Resize handler
    window.addEventListener('resize', () => {
      const imageData = this.toDataURL();
      this.setupCanvas();
      if (this.paths.length > 0) {
        this.redraw();
      }
    });
  }

  getCoordinates(e) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  }

  getTouchCoordinates(e) {
    const rect = this.canvas.getBoundingClientRect();
    const touch = e.touches[0];
    return {
      x: touch.clientX - rect.left,
      y: touch.clientY - rect.top
    };
  }

  startDrawing(e) {
    this.drawing = true;
    const coords = this.getCoordinates(e);
    this.lastX = coords.x;
    this.lastY = coords.y;
    this.currentPath = [{ x: coords.x, y: coords.y }];
  }

  handleTouchStart(e) {
    e.preventDefault();
    this.drawing = true;
    const coords = this.getTouchCoordinates(e);
    this.lastX = coords.x;
    this.lastY = coords.y;
    this.currentPath = [{ x: coords.x, y: coords.y }];
  }

  draw(e) {
    if (!this.drawing) return;

    const coords = this.getCoordinates(e);
    this.drawLine(this.lastX, this.lastY, coords.x, coords.y);
    this.currentPath.push({ x: coords.x, y: coords.y });
    this.lastX = coords.x;
    this.lastY = coords.y;
  }

  handleTouchMove(e) {
    e.preventDefault();
    if (!this.drawing) return;

    const coords = this.getTouchCoordinates(e);
    this.drawLine(this.lastX, this.lastY, coords.x, coords.y);
    this.currentPath.push({ x: coords.x, y: coords.y });
    this.lastX = coords.x;
    this.lastY = coords.y;
  }

  drawLine(x1, y1, x2, y2) {
    this.ctx.beginPath();
    this.ctx.moveTo(x1, y1);
    this.ctx.lineTo(x2, y2);
    this.ctx.stroke();
  }

  stopDrawing() {
    if (this.drawing && this.currentPath.length > 0) {
      this.paths.push([...this.currentPath]);
    }
    this.drawing = false;
    this.currentPath = [];
  }

  redraw() {
    this.ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
    for (const path of this.paths) {
      if (path.length < 2) continue;
      this.ctx.beginPath();
      this.ctx.moveTo(path[0].x, path[0].y);
      for (let i = 1; i < path.length; i++) {
        this.ctx.lineTo(path[i].x, path[i].y);
      }
      this.ctx.stroke();
    }
  }

  clear() {
    this.paths = [];
    this.currentPath = [];
    this.ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
  }

  isEmpty() {
    return this.paths.length === 0;
  }

  toDataURL() {
    return this.canvas.toDataURL('image/png');
  }
}

window.SignaturePad = SignaturePad;
