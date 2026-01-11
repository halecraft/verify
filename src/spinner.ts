/**
 * Arc spinner frames for terminal animation
 */
const SPINNER_FRAMES = ["◜", "◠", "◝", "◞", "◡", "◟"]

/**
 * Spinner animation interval in milliseconds
 */
const SPINNER_INTERVAL = 80

/**
 * Manages spinner animation for terminal output
 */
export class SpinnerManager {
  private frames = SPINNER_FRAMES
  private frameIndex = 0
  private interval: ReturnType<typeof setInterval> | null = null

  /**
   * Start the spinner animation
   * @param onTick - Callback called on each frame update
   */
  start(onTick: () => void): void {
    if (this.interval) return

    this.interval = setInterval(() => {
      this.frameIndex = (this.frameIndex + 1) % this.frames.length
      onTick()
    }, SPINNER_INTERVAL)
  }

  /**
   * Stop the spinner animation
   */
  stop(): void {
    if (this.interval) {
      clearInterval(this.interval)
      this.interval = null
    }
  }

  /**
   * Get the current spinner frame character
   */
  getFrame(): string {
    return this.frames[this.frameIndex]
  }

  /**
   * Check if spinner is currently running
   */
  isRunning(): boolean {
    return this.interval !== null
  }
}
