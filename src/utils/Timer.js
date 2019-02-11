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
      const elapsed = process.hr_time(this.startTime);
      return this.toNanoseconds(elapsed) + this.totalElapsedTime;
    }

    return this.totalElapsedTime;
  }

  start() {
    // Check if timer is already running.
    if (!this.startTime) {
      this.startTime = process.hr_time();
    }
  }

  stop() {
    const elapsed = process.hr_time(this.startTime);
    this.totalElapsedTime += this.toNanoseconds(elapsed);
    this.startTime = null;

    return this.totalElapsedTime;
  }
}

module.exports = Timer;
