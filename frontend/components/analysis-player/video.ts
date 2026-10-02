// Utilidades sobre el elemento <video>.

export function contentRect(video: HTMLVideoElement) {
  const vw = video.videoWidth || 1;
  const vh = video.videoHeight || 1;
  const cw = video.clientWidth;
  const ch = video.clientHeight;
  const videoRatio = vw / vh;
  const boxRatio = cw / ch;
  if (boxRatio > videoRatio) {
    const h = ch;
    const w = h * videoRatio;
    return { x: (cw - w) / 2, y: 0, w, h };
  }
  const w = cw;
  const h = w / videoRatio;
  return { x: 0, y: (ch - h) / 2, w, h };
}

export function waitSeeked(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve) => {
    const target = Math.max(0, Math.min(t, video.duration || t));
    if (
      video.readyState >= 2 &&
      Math.abs(video.currentTime - target) < 0.04
    ) {
      resolve();
      return;
    }
    const finish = () => {
      window.clearTimeout(timer);
      video.removeEventListener("seeked", onSeeked);
      resolve();
    };
    const onSeeked = () => finish();
    const timer = window.setTimeout(finish, 2000);
    video.addEventListener("seeked", onSeeked, { once: true });
    try {
      video.currentTime = target;
    } catch {
      finish();
    }
  });
}
