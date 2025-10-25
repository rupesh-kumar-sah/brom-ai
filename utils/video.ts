

interface FrameExtractionOptions {
  fps?: number;
  startTime?: number;
  endTime?: number;
}

export const extractFramesFromVideo = (videoUrl: string, options: FrameExtractionOptions = {}): Promise<string[]> => {
  const { fps = 1, startTime = 0 } = options;
  // endTime is deliberately not destructured with a default to check for undefined

  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.muted = true;
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    const frames: string[] = [];

    video.addEventListener('loadedmetadata', () => {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const effectiveEndTime = options.endTime === undefined ? video.duration : Math.min(options.endTime, video.duration);

      if (startTime >= effectiveEndTime) {
        video.remove();
        canvas.remove();
        resolve([]);
        return;
      }
      video.currentTime = startTime;
    });
    
    video.addEventListener('error', () => {
        reject(new Error('Failed to load video. Check the file format and integrity.'));
    });

    video.addEventListener('seeked', async () => {
      if (!context) {
        video.remove();
        canvas.remove();
        reject(new Error("Canvas context is not available."));
        return;
      }
      
      const effectiveEndTime = options.endTime === undefined ? video.duration : Math.min(options.endTime, video.duration);

      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const frameDataUrl = canvas.toDataURL('image/jpeg', 0.8);
      // remove "data:image/jpeg;base64," prefix
      frames.push(frameDataUrl.substring(frameDataUrl.indexOf(',') + 1));

      const nextTime = video.currentTime + 1 / fps;
      if (nextTime < effectiveEndTime) {
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