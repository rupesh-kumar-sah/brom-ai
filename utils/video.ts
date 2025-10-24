export const extractFramesFromVideo = (videoUrl: string, fps: number = 1): Promise<string[]> => {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.muted = true;
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    const frames: string[] = [];

    video.addEventListener('loadedmetadata', () => {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      video.currentTime = 0;
    });

    video.addEventListener('seeked', async () => {
      if (!context) return;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const frameDataUrl = canvas.toDataURL('image/jpeg', 0.8);
      // remove "data:image/jpeg;base64," prefix
      frames.push(frameDataUrl.substring(frameDataUrl.indexOf(',') + 1));

      const nextTime = video.currentTime + 1 / fps;
      if (nextTime < video.duration) {
        video.currentTime = nextTime;
      } else {
        video.remove();
        canvas.remove();
        resolve(frames);
      }
    });

    video.src = videoUrl;
  });
};

export const fileToBase64 = (file: File | Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      // remove "data:*/*;base64," prefix
      resolve(result.substring(result.indexOf(',') + 1));
    };
    reader.onerror = (error) => reject(error);
  });
};
