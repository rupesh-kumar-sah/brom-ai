import React, { useState } from 'react';
import { GoogleGenAI, Modality } from '@google/genai';
import { Loader } from '../../common/Loader';
import { fileToBase64 } from '../../../utils/video';

type Mode = 'generate' | 'edit';
type AspectRatio = '1:1' | '16:9' | '9:16' | '4:3' | '3:4';

const ASPECT_RATIOS: AspectRatio[] = ['1:1', '16:9', '9:16', '4:3', '3:4'];

interface ImageEditorViewProps {
  apiKey: string;
}

export const ImageEditorView: React.FC<ImageEditorViewProps> = ({ apiKey }) => {
  const [mode, setMode] = useState<Mode>('generate');
  const [prompt, setPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('1:1');
  
  // Edit mode state
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [originalImageFile, setOriginalImageFile] = useState<File | null>(null);
  
  // Shared state
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setOriginalImageFile(file);
      const reader = new FileReader();
      reader.onload = (event) => {
        setOriginalImage(event.target?.result as string);
        setGeneratedImage(null); // Clear previous result on new image
      };
      reader.readAsDataURL(file);
    }
  };

  const handleGenerate = async () => {
    if (!prompt) {
      setError('Please provide a prompt.');
      return;
    }
    if (mode === 'edit' && !originalImageFile) {
        setError('Please upload an image to edit.');
        return;
    }

    setIsLoading(true);
    setError(null);
    setGeneratedImage(null);
    const ai = new GoogleGenAI({ apiKey });

    try {
        if (mode === 'generate') {
            const response = await ai.models.generateImages({
                model: 'imagen-4.0-generate-001',
                prompt: prompt,
                config: {
                    numberOfImages: 1,
                    aspectRatio: aspectRatio,
                },
            });
            const base64ImageBytes = response.generatedImages[0].image.imageBytes;
            setGeneratedImage(`data:image/png;base64,${base64ImageBytes}`);
        } else { // mode === 'edit'
            const base64Data = await fileToBase64(originalImageFile!);
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash-image',
                contents: {
                    parts: [
                        { inlineData: { data: base64Data, mimeType: originalImageFile!.type } },
                        { text: prompt },
                    ],
                },
                config: {
                    responseModalities: [Modality.IMAGE],
                },
            });

            const imagePart = response.candidates?.[0]?.content.parts.find(p => p.inlineData);
            if (imagePart?.inlineData) {
                const base64ImageData = imagePart.inlineData.data;
                setGeneratedImage(`data:${imagePart.inlineData.mimeType};base64,${base64ImageData}`);
            } else {
                throw new Error('No image was generated. The model may have refused the request.');
            }
        }
    } catch (err: any) {
        console.error('Image operation error:', err);
        setError(err.message || 'Failed to process image. Please try again.');
    } finally {
        setIsLoading(false);
    }
  };
  
  const reset = () => {
    setPrompt('');
    setOriginalImage(null);
    setOriginalImageFile(null);
    setGeneratedImage(null);
    setError(null);
  }

  return (
    <div className="flex flex-col h-full">
        <div className="flex-shrink-0 p-2 bg-gray-800/50 rounded-lg self-center mb-4">
            <div className="flex space-x-1">
                <button onClick={() => { setMode('generate'); reset(); }} className={`px-4 py-2 text-sm font-semibold rounded-md ${mode === 'generate' ? 'bg-cyan-500 text-white' : 'text-gray-300 hover:bg-gray-700'}`}>Generate</button>
                <button onClick={() => { setMode('edit'); reset(); }} className={`px-4 py-2 text-sm font-semibold rounded-md ${mode === 'edit' ? 'bg-cyan-500 text-white' : 'text-gray-300 hover:bg-gray-700'}`}>Edit</button>
            </div>
        </div>

      <div className="flex-1 overflow-y-auto p-1">
        <div className={`grid grid-cols-1 ${mode === 'edit' && 'md:grid-cols-2'} gap-6`}>
            {mode === 'edit' && (
              <div className="flex flex-col items-center justify-center bg-gray-800 p-4 rounded-lg border-2 border-dashed border-gray-600 min-h-[300px]">
                <h3 className="text-lg font-semibold mb-2 text-gray-300">Original Image</h3>
                {originalImage ? (
                  <img src={originalImage} alt="Original" className="max-h-80 w-auto rounded-md object-contain" />
                ) : (
                    <div className="text-center text-gray-400">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-16 h-16 mx-auto text-gray-500"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25z" /></svg>
                        <p className="mt-2">Upload an image to start editing.</p>
                         <input type="file" id="image-upload" accept="image/*" onChange={handleImageUpload} className="sr-only"/>
                         <label htmlFor="image-upload" className="mt-4 inline-block bg-cyan-600 hover:bg-cyan-700 text-white font-bold py-2 px-4 rounded cursor-pointer">Choose File</label>
                    </div>
                )}
              </div>
            )}
          
          <div className={`flex flex-col items-center justify-center bg-gray-800 p-4 rounded-lg border-2 border-dashed border-gray-600 min-h-[300px] ${mode === 'generate' && 'col-span-1'}`}>
            <h3 className="text-lg font-semibold mb-2 text-gray-300">Result</h3>
            {isLoading ? <Loader text={mode === 'generate' ? "Generating image..." : "Editing image..."} /> :
             generatedImage ? (
              <img src={generatedImage} alt="Generated" className="max-h-80 w-auto rounded-md object-contain" />
            ) : (
                <div className="text-center text-gray-400">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-16 h-16 mx-auto text-gray-500"><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.898 20.553L16.5 21.75l-.398-1.197a3.375 3.375 0 00-2.456-2.456L12.75 18l1.197-.398a3.375 3.375 0 002.456-2.456L16.5 14.25l.398 1.197a3.375 3.375 0 002.456 2.456l1.197.398-1.197.398a3.375 3.375 0 00-2.456 2.456z" /></svg>
                  <p className="mt-2">Your {mode}ed image will appear here.</p>
                </div>
            )}
          </div>
        </div>
        {error && <p className="text-red-400 text-center mt-4">{error}</p>}
      </div>

      <div className="p-4 bg-gray-900 border-t border-gray-700/50 space-y-4">
        {mode === 'generate' && (
            <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Aspect Ratio</label>
                <div className="flex flex-wrap gap-2">
                    {ASPECT_RATIOS.map(ar => (
                        <button key={ar} onClick={() => setAspectRatio(ar)} className={`px-3 py-1.5 text-sm rounded-md ${aspectRatio === ar ? 'bg-cyan-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}>{ar}</button>
                    ))}
                </div>
            </div>
        )}
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={mode === 'generate' ? "Describe the image you want to create..." : "Describe the changes you want to make..."}
          className="w-full bg-gray-800 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-cyan-500"
          rows={2}
        />
        <button onClick={handleGenerate} disabled={isLoading || !prompt || (mode === 'edit' && !originalImage)} className="w-full bg-cyan-500 rounded-lg p-3 text-white font-semibold hover:bg-cyan-600 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors">
          {isLoading ? 'Processing...' : (mode === 'generate' ? 'Generate Image' : 'Apply Edit')}
        </button>
      </div>
    </div>
  );
};