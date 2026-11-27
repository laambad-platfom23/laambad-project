"use client";

/**
 * A7 — where the video on screen is now, so a note can say "at 03:25". There is one player on the
 * page at a time; the learn page resets it when the lesson changes.
 */
export const playback = {
  seconds: 0,
  reset() {
    this.seconds = 0;
  },
};

/**
 * A2 — counts the seconds of a video that were really PLAYED (not skipped by seeking), so a lesson
 * can complete automatically at 80 %. Works with any player that exposes currentTime + duration.
 */
export class WatchTracker {
  private watched = new Set<number>();
  private last: number | null = null;
  private duration = 0;
  private lastReported = -1;

  constructor(
    private readonly onPercent: (percent: number) => void,
    /** report again after this many more percent (the 80 % mark is always reported) */
    private readonly step = 10
  ) {}

  /** call on every time update (or poll) with the player's position */
  tick(currentTime: number, duration: number) {
    if (!Number.isFinite(currentTime) || !Number.isFinite(duration) || duration <= 0) return;
    playback.seconds = currentTime;
    this.duration = duration;
    const last = this.last;
    this.last = currentTime;
    if (last === null) return;
    const delta = currentTime - last;
    // normal playback (also 2x speed + slow polling); anything else is a seek and does not count
    if (delta <= 0 || delta > 4) return;
    for (let s = Math.floor(last); s < Math.floor(currentTime); s++) this.watched.add(s);
    this.report();
  }

  /** a seek happened: the next tick starts a new range */
  seek() {
    this.last = null;
  }

  /** the video ended: count the last partial second */
  ended() {
    if (this.duration > 0 && this.last !== null) {
      for (let s = Math.floor(this.last); s < Math.floor(this.duration); s++) {
        if (this.duration - s <= 2) this.watched.add(s);
      }
    }
    this.report();
  }

  percent() {
    const total = Math.max(1, Math.floor(this.duration));
    return Math.min(100, Math.round((this.watched.size / total) * 100));
  }

  private report() {
    const p = this.percent();
    const crossed80 = this.lastReported < 80 && p >= 80;
    if (crossed80 || p - this.lastReported >= this.step) {
      this.lastReported = p;
      this.onPercent(p);
    }
  }
}
