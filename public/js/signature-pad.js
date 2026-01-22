class SignaturePad {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.drawing = false;
    this.lastX = 0;
    this.lastY = 0;
    this.paths = [];
    this.currentPath = [];
    this.initialized = false;

    this.bindEvents();
  }

  init() {
    if (this.initialized) return;

    const rect = this.canvas.getBoundingClientRect();

    // Don't initialize if canvas isn't visible yet
    if (rect.width === 0 || rect.height === 0) {
      return;
    }

    const dpr = window.devicePixelRatio || 1;

    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;

    this.ctx.scale(dpr, dpr);
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    this.ctx.lineWidth = 2.5;
    this.ctx.strokeStyle = '#000';

    this.canvasWidth = rect.width;
    this.canvasHeight = rect.height;
    this.initialized = true;
  }

  bindEvents() {
    // Mouse events
    this.canvas.addEventListener('mousedown', (e) => {
      e.preventDefault();
      this.init();
      this.startDrawing(e);
    });
    this.canvas.addEventListener('mousemove', (e) => {
      e.preventDefault();
      this.draw(e);
    });
    this.canvas.addEventListener('mouseup', (e) => {
      e.preventDefault();
      this.stopDrawing();
    });
    this.canvas.addEventListener('mouseleave', () => this.stopDrawing());

    // Touch events
    this.canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.init();
      this.handleTouchStart(e);
    }, { passive: false });
    this.canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      this.handleTouchMove(e);
    }, { passive: false });
    this.canvas.addEventListener('touchend', (e) => {
      e.preventDefault();
      this.stopDrawing();
    });

    // Resize handler
    window.addEventListener('resize', () => {
      if (this.initialized) {
        this.reinit();
      }
    });
  }

  reinit() {
    const pathsCopy = [...this.paths];
    this.initialized = false;
    this.init();
    this.paths = pathsCopy;
    this.redraw();
  }

  getCoordinates(e) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvasWidth / rect.width;
    const scaleY = this.canvasHeight / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  }

  getTouchCoordinates(e) {
    const rect = this.canvas.getBoundingClientRect();
    const touch = e.touches[0];
    const scaleX = this.canvasWidth / rect.width;
    const scaleY = this.canvasHeight / rect.height;
    return {
      x: (touch.clientX - rect.left) * scaleX,
      y: (touch.clientY - rect.top) * scaleY
    };
  }

  startDrawing(e) {
    this.drawing = true;
    const coords = this.getCoordinates(e);
    this.lastX = coords.x;
    this.lastY = coords.y;
    this.currentPath = [{ x: coords.x, y: coords.y }];

    // Draw a dot for single clicks
    this.ctx.beginPath();
    this.ctx.arc(coords.x, coords.y, 1, 0, Math.PI * 2);
    this.ctx.fill();
  }

  handleTouchStart(e) {
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
    if (!this.initialized) return;

    this.ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);

    for (const path of this.paths) {
      if (path.length === 0) continue;

      if (path.length === 1) {
        this.ctx.beginPath();
        this.ctx.arc(path[0].x, path[0].y, 1, 0, Math.PI * 2);
        this.ctx.fill();
        continue;
      }

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
    if (this.initialized) {
      this.ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
    }
  }

  isEmpty() {
    return this.paths.length === 0;
  }

  toDataURL() {
    if (!this.initialized) {
      this.init();
    }
    return this.canvas.toDataURL('image/png');
  }
}

window.SignaturePad = SignaturePad;
