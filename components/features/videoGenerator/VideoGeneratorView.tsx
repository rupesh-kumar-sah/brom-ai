import React, { useState, useEffect, useCallback } from 'react';
import { GoogleGenAI, GenerateVideosOperation } from '@google/genai';
import { Loader } from '../../common/Loader';
import { fileToBase64 } from '../../../utils/video';

type GenerationState = 'idle' | 'generating' | 'polling' | 'success' | 'error';
type AspectRatio = '16:9' | '9:16';

interface VideoGeneratorViewProps {}

export const VideoGeneratorView: React.FC<VideoGeneratorViewProps> = () => {
  const [prompt, setPrompt] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('16:9');
  const [state, setState] = useState<GenerationState>('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // API key management state
  const [hasSelectedKey, setHasSelectedKey] = useState(false);
  const [isCheckingKey, setIsCheckingKey] = useState(true);

  // Reusable function to open the key selection dialog
  const promptForKeySelection = useCallback(async () => {
    try {
      await (window as any).aistudio.openSelectKey();
      // Per guidelines, assume key is selected to handle race conditions.
      // This ensures the main UI is shown after the initial selection.
      setHasSelectedKey(true);
    } catch (e) {
      console.error("Error opening key selection:", e);
      // If the initial selection fails, we still assume a key might have been selected
      // to allow the user to try generating, which will trigger the error flow if needed.
      setHasSelectedKey(true);
    }
  }, []);


  // Check for key on mount
  useEffect(() => {
    const checkKey = async () => {
      setIsCheckingKey(true);
      try {
        const hasKey = await (window as any).aistudio.hasSelectedApiKey();
        setHasSelectedKey(hasKey);
      } catch (e) {
        console.error("Error checking for API key:", e);
        setHasSelectedKey(false);
      } finally {
        setIsCheckingKey(false);
      }
    };
    checkKey();
  }, []);

  const pollOperation = useCallback(async (operation: GenerateVideosOperation) => {
    setStatusMessage('Polling for video status...');
    setState('polling');
    let currentOp = operation;

    while (!currentOp.done) {
      await new Promise(resolve => setTimeout(resolve, 10000));
      // Re-create the AI instance for each poll to use the latest key
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
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

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setImageFile(file);
      const reader = new FileReader();
      reader.onload = (event) => setImagePreview(event.target?.result as string);
      reader.readAsDataURL(file);
    }
  };

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
      // Create a new instance right before the call to ensure the latest key is used.
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
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
        let detailedMessage = err.message || 'An unknown error occurred.';
        try {
          // Error might be a JSON string, try to parse it for a cleaner message.
          const parsed = JSON.parse(detailedMessage);
          if (parsed.error && parsed.error.message) {
            detailedMessage = parsed.error.message;
          }
        } catch (e) {
          // It wasn't JSON, use the message as is.
        }
        
        if (detailedMessage.includes('Requested entity was not found')) {
            // This is the specific error for invalid API keys with the Veo model.
            setError('Your selected API Key appears to be invalid or lacks permissions. A dialog has been opened to select a different key. Please try again after selecting one.');
            setState('error');
            // Do not hide the UI. Immediately prompt the user to select a new key.
            // The user's inputs are preserved.
            await promptForKeySelection();
        } else {
            setError(`Generation failed: ${detailedMessage}`);
            setState('error');
        }
    }
  };

  if (isCheckingKey) {
    return <Loader text="Checking API Key..." />;
  }

  if (!hasSelectedKey) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-4">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-cyan-500 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg>
        <h2 className="text-xl font-bold mb-2 text-white">API Key Required</h2>
        <p className="text-gray-400 mb-6 max-w-md">The Veo video generation model requires a personal API key with billing enabled to function.</p>
        <button onClick={promptForKeySelection} className="bg-cyan-500 hover:bg-cyan-600 text-white font-bold py-3 px-6 rounded-lg transition-colors text-lg">
          Select API Key
        </button>
        <p className="text-xs text-gray-500 mt-6">
            For more information on billing, visit <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline">ai.google.dev/gemini-api/docs/billing</a>.
        </p>
      </div>
    );
  }

  const isLoading = state === 'generating' || state === 'polling';

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {state === 'success' && videoUrl ? (
             <div className="flex flex-col items-center space-y-4">
                <h3 className="text-xl font-semibold">Video Ready!</h3>
                <video src={videoUrl} controls autoPlay loop className="w-full max-w-lg rounded-lg shadow-lg"></video>
                <button onClick={() => { setState('idle'); setVideoUrl(null); setPrompt(''); setImageFile(null); setImagePreview(null); }} className="bg-cyan-500 hover:bg-cyan-600 text-white font-bold py-2 px-4 rounded-lg transition-colors">Generate Another Video</button>
             </div>
        ) : isLoading ? (
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
            <button onClick={handleGenerate} disabled={isLoading || !imageFile} className="w-full bg-cyan-500 rounded-lg p-3 text-white font-semibold hover:bg-cyan-600 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors">
            Generate Video
            </button>
        </div>
      )}
    </div>
  );
};