/**
 * Simplified SM-2 spaced-repetition scheduler shared by vocab and sentence review.
 * rating: 'again' | 'hard' | 'good' | 'easy'
 */

const MIN_EASE = 1.3;

export function newProgressItem(id) {
  return {
    id,
    status: 'new', // new -> learning -> review
    ease: 2.5,
    interval: 0, // days
    reps: 0,
    lapses: 0,
    due: todayISO(),
    lastReviewed: null
  };
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const QUALITY = { again: 2, hard: 3, good: 4, easy: 5 };

export function schedule(item, rating) {
  const quality = QUALITY[rating] ?? 4;
  const next = { ...item };

  if (quality < 3) {
    // Failed recall: reset progress, short re-learning interval.
    next.reps = 0;
    next.lapses = (item.lapses || 0) + 1;
    next.ease = Math.max(MIN_EASE, item.ease - 0.2);
    next.interval = 1;
    next.status = 'learning';
  } else {
    let interval;
    if (item.reps === 0) {
      interval = 1;
    } else if (item.reps === 1) {
      interval = 6;
    } else {
      interval = Math.round(item.interval * item.ease);
    }

    if (rating === 'hard') {
      interval = Math.max(1, Math.round(interval * 0.8));
    } else if (rating === 'easy') {
      interval = Math.round(interval * 1.3);
    }

    next.reps = item.reps + 1;
    next.ease = Math.max(MIN_EASE, item.ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));
    next.interval = Math.max(1, interval);
    next.status = 'review';
  }

  next.due = addDays(next.interval);
  next.lastReviewed = new Date().toISOString();
  return next;
}

export function isDue(item, onDate = todayISO()) {
  return item.due <= onDate;
}
