// Timer component for displaying turn timeout
export class TurnTimer {
  constructor(container, options = {}) {
    this.container = container;
    this.timeoutMs = options.timeoutMs || 24 * 60 * 60 * 1000; // 24 hours default
    this.lastMoveAt = options.lastMoveAt;
    this.onTimeout = options.onTimeout || null;
    this.onUpdate = options.onUpdate || null;
    this.isExpired = false;
    this.intervalId = null;
  }

  start(lastMoveAt) {
    this.lastMoveAt = lastMoveAt ? new Date(lastMoveAt) : new Date();
    this.isExpired = false;
    this.update();
    this.intervalId = setInterval(() => this.update(), 1000);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  update() {
    if (!this.lastMoveAt) {
      this.render("--:--:--");
      return;
    }

    const now = new Date();
    const elapsed = now - this.lastMoveAt;
    const remaining = this.timeoutMs - elapsed;

    if (remaining <= 0) {
      this.isExpired = true;
      this.render("Expired", true);
      this.stop();
      if (this.onTimeout) {
        this.onTimeout();
      }
      return;
    }

    const hours = Math.floor(remaining / (1000 * 60 * 60));
    const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((remaining % (1000 * 60)) / 1000);

    const timeString = `${hours}h ${minutes}m ${seconds}s`;
    this.render(timeString, false);

    if (this.onUpdate) {
      this.onUpdate({ hours, minutes, seconds, remaining });
    }
  }

  render(timeString, expired) {
    if (!this.container) return;

    const lang = localStorage.getItem("language") || "en";
    const label = lang === "ru" ? "Время до истечения:" : "Time remaining:";

    if (expired) {
      const expiredText = lang === "ru" ? "Время истекло" : "Expired";
      this.container.innerHTML = `
        <div class="timer-display expired">
          <span class="timer-label">${label}</span>
          <span class="timer-value">${expiredText}</span>
        </div>
      `;
    } else {
      this.container.innerHTML = `
        <div class="timer-display">
          <span class="timer-label">${label}</span>
          <span class="timer-value">${timeString}</span>
        </div>
      `;
    }
  }

  destroy() {
    this.stop();
    if (this.container) {
      this.container.innerHTML = "";
    }
  }
}

