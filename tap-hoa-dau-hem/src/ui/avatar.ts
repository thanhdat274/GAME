import Phaser from 'phaser';

/** Cache ảnh hồ sơ Google thành texture Phaser; lỗi mạng/CORS chỉ giữ avatar chữ G dự phòng. */
export async function cacheGoogleAvatar(scene: Phaser.Scene, url: string, key: string): Promise<boolean> {
  if (scene.textures.exists(key)) return true;
  if (!url.startsWith('https://')) return false;

  return new Promise((resolve) => {
    const image = new Image();
    const timeout = window.setTimeout(() => finish(false), 5000);
    let settled = false;
    const finish = (loaded: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      image.onload = null;
      image.onerror = null;
      if (loaded) {
        try {
          if (!scene.textures.exists(key)) scene.textures.addImage(key, image);
          resolve(scene.textures.exists(key));
          return;
        } catch {
          // Keep the account pill's built-in Google-letter placeholder.
        }
      }
      resolve(false);
    };
    image.crossOrigin = 'anonymous';
    image.onload = () => finish(true);
    image.onerror = () => finish(false);
    image.src = url;
  });
}
