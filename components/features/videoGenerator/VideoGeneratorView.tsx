
import React, { useState, useEffect, useCallback } from 'react';
import { GoogleGenAI, GenerateVideosOperation } from '@google/genai';
import { Loader } from '../../common/Loader';
import { fileToBase64 } from '../../../utils/video';

type GenerationState = 'idle' | 'generating' | 'polling' | 'success' | 'error';
type AspectRatio = '16:9' | '9:16';

export const VideoGeneratorView: React.FC = () => {
  const [prompt, setPrompt] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('16:9');
  const [state, setState] = useState<GenerationState>('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setImageFile(file);
      const reader = new FileReader();
      reader.onload = (event) => setImagePreview(event.target?.result as string);
      reader.readAsDataURL(file);
    }
  };

  const pollOperation = useCallback(async (operation: GenerateVideosOperation) => {
    setStatusMessage('Polling for video status...');
    setState('polling');
    let currentOp = operation;

    while (!currentOp.done) {
      await new Promise(resolve => setTimeout(resolve, 10000));
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
      currentOp = await ai.operations.getVideosOperation({ operation: currentOp });
    }
    
    const downloadLink = currentOp.response?.generatedVideos?.[0]?.video?.uri;
    if (downloadLink) {
        // Must append API key for access
        const response = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
        const blob = await response.blob();
        setVideoUrl(URL.createObjectURL(blob));
        setState('success');
        setStatusMessage('Video generated successfully!');
    } else {
        throw new Error('Video generation finished but no video URL was found.');
    }
  }, []);

  const handleGenerate = async () => {
    if (!imageFile) {
      setError('Please upload a starting image.');
      return;
    }
    setState('generating');
    setError(null);
    setVideoUrl(null);
    setStatusMessage('Starting video generation...');
    
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
      const base64Data = await fileToBase64(imageFile);

      setStatusMessage('Sending request to Gemini... This may take a moment.');
      let operation = await ai.models.generateVideos({
        model: 'veo-3.1-fast-generate-preview',
        prompt: prompt || 'Animate this image.',
        image: {
          imageBytes: base64Data,
          mimeType: imageFile.type,
        },
        config: {
          numberOfVideos: 1,
          resolution: '720p',
          aspectRatio: aspectRatio,
        }
      });
      await pollOperation(operation);

    } catch (err: any) {
        console.error('Video generation error:', err);
        // The raw error message is often a stringified JSON.
        let detailedMessage = err.message || 'An unknown error occurred.';
        try {
          const parsed = JSON.parse(detailedMessage);
          if (parsed.error && parsed.error.message) {
            detailedMessage = parsed.error.message;
          }
        } catch (e) {
          // It wasn't JSON, use the message as is.
        }
        
        // Check for the specific API key error.
        if (detailedMessage.includes('Requested entity was not found')) {
            setError('Your selected API Key appears to be invalid or lacks the necessary permissions for the Veo model. Please refresh the page and select a different key.');
        } else {
            setError(detailedMessage);
        }
        setState('error');
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {state === 'success' && videoUrl ? (
             <div className="flex flex-col items-center space-y-4">
                <h3 className="text-xl font-semibold">Video Ready!</h3>
                <video src={videoUrl} controls autoPlay loop className="w-full max-w-lg rounded-lg shadow-lg"></video>
                <button onClick={() => setState('idle')} className="bg-cyan-500 hover:bg-cyan-600 text-white font-bold py-2 px-4 rounded-lg transition-colors">Generate Another Video</button>
             </div>
        ) : state === 'generating' || state === 'polling' ? (
             <div className="flex flex-col items-center justify-center h-full text-center">
                <Loader text={statusMessage}/>
                <p className="text-gray-400 mt-4 max-w-md">Video generation can take several minutes. Please keep this page open.</p>
             </div>
        ) : (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Starting Image</label>
              <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-600 border-dashed rounded-md">
                <div className="space-y-1 text-center">
                  {imagePreview ? <img src={imagePreview} alt="Preview" className="mx-auto h-32 w-auto rounded-md" /> :  <svg className="mx-auto h-12 w-12 text-gray-500" stroke="currentColor" fill="none" viewBox="0 0 48 48" aria-hidden="true"><path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"></path></svg> }
                  <div className="flex text-sm text-gray-400">
                    <label htmlFor="file-upload" className="relative cursor-pointer bg-gray-800 rounded-md font-medium text-cyan-400 hover:text-cyan-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-offset-gray-900 focus-within:ring-cyan-500">
                      <span>Upload a file</span>
                      <input id="file-upload" name="file-upload" type="file" className="sr-only" accept="image/*" onChange={handleImageUpload}/>
                    </label>
                    <p className="pl-1">or drag and drop</p>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <label htmlFor="prompt" className="block text-sm font-medium text-gray-300">Prompt (optional)</label>
              <textarea id="prompt" value={prompt} onChange={e => setPrompt(e.target.value)} rows={3} className="mt-1 block w-full bg-gray-800 rounded-md border-gray-600 shadow-sm focus:border-cyan-500 focus:ring-cyan-500 sm:text-sm text-white p-2"></textarea>
            </div>
            
            <div>
                 <label className="block text-sm font-medium text-gray-300">Aspect Ratio</label>
                 <div className="mt-2 flex space-x-4">
                    <button onClick={() => setAspectRatio('16:9')} className={`px-4 py-2 rounded-md ${aspectRatio === '16:9' ? 'bg-cyan-600' : 'bg-gray-700'}`}>Landscape (16:9)</button>
                    <button onClick={() => setAspectRatio('9:16')} className={`px-4 py-2 rounded-md ${aspectRatio === '9:16' ? 'bg-cyan-600' : 'bg-gray-700'}`}>Portrait (9:16)</button>
                 </div>
            </div>

            {error && <p className="text-red-400 text-center">{error}</p>}
          </>
        )}
      </div>

      {(state === 'idle' || state === 'error') && (
        <div className="p-4 bg-gray-900 border-t border-gray-700/50">
            <button onClick={handleGenerate} disabled={!imageFile} className="w-full bg-cyan-500 rounded-lg p-3 text-white font-semibold hover:bg-cyan-600 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors">
            Generate Video
            </button>
        </div>
      )}
    </div>
  );
};
