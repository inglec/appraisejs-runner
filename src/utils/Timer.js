class Timer {
  constructor() {
    this.startTime = null;
    this.totalElapsedTime = 0;
  }

  static toNanoseconds([seconds, nanoseconds]) {
    return seconds * 1e9 + nanoseconds;
  }

  getElapsedTime() {
    if (this.startTime) {
      const elapsed = process.hrtime(this.startTime);
      return this.toNanoseconds(elapsed) + this.totalElapsedTime;
    }

    return this.totalElapsedTime;
  }

  start() {
    // Check if timer is already running.
    if (!this.startTime) {
      this.startTime = process.hrtime();
    }
  }

  stop() {
    const elapsed = process.hrtime(this.startTime);
    this.totalElapsedTime += this.constructor.toNanoseconds(elapsed);
    this.startTime = null;

    return this.totalElapsedTime;
  }
}

module.exports = Timer;
