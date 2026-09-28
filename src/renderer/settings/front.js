import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { reducedMotion } from '../shared/ui.js';

const fmt = (sec) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

/**
 * Front desk mode in miniature: a break is on, a click sets it aside, it folds into the capsule,
 * you look something up, the capsule's clock runs down (fast-forwarded) and the break comes back.
 * `returnMin` is read on every loop, so the demo always shows the configured time.
 */
export function createFrontDemo(root, { returnMin }) {
  const q = gsap.utils.selector(root);
  const [orb] = q('.fd__orb');
  const [overlay] = q('.fd__overlay');
  const [btn] = q('.fd__btn');
  const [pill] = q('.fd__pill');
  const [ring] = q('.fd__ring');
  const [time] = q('.fd__time');
  const [cursor] = q('.fd__cursor');
  const [hit] = q('.fd__hit');

  const clock = { left: 1 };
  const paint = () => {
    ring.style.setProperty('--p', clock.left.toFixed(3));
    time.textContent = fmt(clock.left * returnMin() * 60);
    pill.classList.toggle('is-soon', clock.left < 0.25);
  };
  paint();
  if (reducedMotion) return;

  const click = (target, at) => [
    [cursor, { scale: 0.8, duration: 0.09, yoyo: true, repeat: 1, ease: 'power2.out' }, at],
    target && [target, { scale: 0.93, duration: 0.09, yoyo: true, repeat: 1, ease: 'power2.out' }, at],
  ];

  const tl = gsap.timeline({ repeat: -1, repeatDelay: 0.5, paused: true, defaults: { ease: 'power3.inOut' } });
  tl.set(overlay, { autoAlpha: 1 })
    .set(orb, { top: '50%', scale: 1, autoAlpha: 1 })
    .set(btn, { autoAlpha: 1, scale: 1 })
    .set(pill, { autoAlpha: 0, y: -10, scaleX: 0.45 })
    .set(hit, { opacity: 0 })
    .set(clock, { left: 1, onComplete: paint })
    // A calm break. Then the phone rings: over to the button.
    .to(orb, { scale: 1.07, duration: 1.1, ease: 'sine.inOut', yoyo: true, repeat: 1 }, 0)
    .fromTo(cursor, { left: '78%', top: '80%' }, { left: '51%', top: '9%', duration: 1, ease: 'power3.inOut' }, 0.45);
  for (const step of click(btn, 1.5)) tl.to(...step);
  // Everything folds up into the capsule.
  tl.to(orb, { top: '10%', scale: 0.1, autoAlpha: 0, duration: 0.45, ease: 'expo.in' }, 1.68)
    .to(overlay, { autoAlpha: 0, duration: 0.4, ease: 'power2.in' }, 1.72)
    .to(btn, { autoAlpha: 0, duration: 0.18, ease: 'power2.in' }, 1.9)
    .to(pill, { autoAlpha: 1, y: 0, scaleX: 1, duration: 0.65, ease: 'back.out(1.5)' }, 2.05)
    // Look something up while the capsule keeps time.
    .to(cursor, { left: '50%', top: '69%', duration: 0.85 }, 2.35)
    .to(hit, { opacity: 1, duration: 0.25, ease: 'power2.out' }, 3.28)
    .to(hit, { opacity: 0, duration: 0.9, ease: 'power2.inOut' }, 4.6)
    .to(clock, { left: 0, duration: 4.1, ease: 'power1.in', onUpdate: paint }, 2.4)
    .to(cursor, { left: '80%', top: '46%', duration: 1.1 }, 4.9)
    // The break comes back out of the capsule.
    .to(pill, { autoAlpha: 0, scaleX: 0.5, duration: 0.3, ease: 'power2.in' }, 6.55)
    .to(overlay, { autoAlpha: 1, duration: 0.6, ease: 'power2.out' }, 6.6)
    .fromTo(orb, { top: '10%', scale: 0.1, autoAlpha: 1 }, { top: '50%', scale: 1, duration: 1.1, ease: 'expo.out' }, 6.62)
    .to(btn, { autoAlpha: 1, duration: 0.5, ease: 'power2.out' }, 7.1)
    .to(cursor, { left: '78%', top: '80%', duration: 1, ease: 'power2.inOut' }, 7.2)
    .to({}, { duration: 1 }, 7.8);
  for (const step of click(null, 3.24).filter(Boolean)) tl.to(...step);

  // Only runs while it can be seen.
  ScrollTrigger.create({
    trigger: root,
    start: 'top bottom',
    end: 'bottom top',
    onToggle: (self) => (self.isActive ? tl.play() : tl.pause()),
  });
  return { timeline: tl };
}
