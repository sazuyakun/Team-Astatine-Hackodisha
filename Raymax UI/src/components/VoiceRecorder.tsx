import React, { useState, useRef, useEffect } from 'react';
import { Mic } from 'lucide-react';
import { AssemblyAI } from 'assemblyai';

// const ASSEMBLYAI_API_KEY = import.meta.env.ASSEMBLYAI_API_KEY;
const ASSEMBLYAI_API_KEY = 'd4f150019b0f4f739c0cec0940ff6873';
const CLOUDINARY_UPLOAD_PRESET = 'Project-Kenko'; // Replace with your Cloudinary upload preset
const CLOUDINARY_CLOUD_NAME = 'dzxgf75bh'; // Replace with your Cloudinary cloud name

interface VoiceRecorderProps {
  onSendMessage: (message: string) => void;
}

const VoiceRecorder: React.FC<VoiceRecorderProps> = ({ onSendMessage }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);

  const client = new AssemblyAI({ apiKey: ASSEMBLYAI_API_KEY });

  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioContextRef.current = new AudioContext();
      analyserRef.current = audioContextRef.current.createAnalyser();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      source.connect(analyserRef.current);

      const chunks: Blob[] = [];
      mediaRecorderRef.current.ondataavailable = (e) => chunks.push(e.data);
      mediaRecorderRef.current.onstop = async () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        setAudioBlob(blob);
        await uploadToCloudinary(blob); // Upload audio to Cloudinary automatically after stop
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
      setError(null);
      drawWaveform();
    } catch (error) {
      console.error('Error starting recording:', error);
      setError('An error occurred while trying to start recording. Please try again.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    }
  };

  const drawWaveform = () => {
    if (!analyserRef.current || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const canvasCtx = canvas.getContext('2d');
    const analyser = analyserRef.current;
    const bufferLength = analyser.fftSize;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      if (!canvasCtx) return;

      analyser.getByteTimeDomainData(dataArray);

      canvasCtx.fillStyle = 'rgb(16, 24, 39)';
      canvasCtx.fillRect(0, 0, canvas.width, canvas.height);

      canvasCtx.lineWidth = 2;
      canvasCtx.strokeStyle = 'rgb(155, 255, 255)';

      canvasCtx.beginPath();

      const sliceWidth = (canvas.width * 1.0) / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = (v * canvas.height) / 2;

        if (i === 0) {
          canvasCtx.moveTo(x, y);
        } else {
          canvasCtx.lineTo(x, y);
        }

        x += sliceWidth;
      }

      canvasCtx.lineTo(canvas.width, canvas.height / 2);
      canvasCtx.stroke();

      animationFrameRef.current = requestAnimationFrame(draw);
    };

    draw();
  };

  const uploadToCloudinary = async (audioBlob: Blob) => {
    const formData = new FormData();
    formData.append('file', audioBlob);
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

    try {
      const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/upload`, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      if (data.secure_url) {
        console.log('Uploaded Audio URL:', data.secure_url);
        await convertSpeechToText(data.secure_url); // Convert to text automatically after upload
      } else {
        throw new Error('Failed to upload audio');
      }
    } catch (error) {
      console.error('Error uploading to Cloudinary:', error);
      setError('Error uploading to Cloudinary');
    }
  };

  const convertSpeechToText = async (audioURL: string) => {
    try {
      console.log('Starting speech-to-text conversion');

      const params = {
        audio: audioURL, // Use the Cloudinary audio URL
        speaker_labels: true, // Optional: include speaker labels if needed
      };

      const transcript = await client.transcripts.transcribe(params);

      if (transcript.status === 'error') {
        throw new Error(transcript.error);
      }

      console.log('Transcription completed:', transcript.text);
      onSendMessage(transcript.text);

      // Optional: Log speaker labels if included
      if (transcript.utterances) {
        transcript.utterances.forEach((utterance) => {
          console.log(`Speaker ${utterance.speaker}: ${utterance.text}`);
        });
      }
    } catch (error) {
      console.error('Error converting speech to text:', error);
      setError(`Error during speech-to-text conversion: ${error.message || 'Unknown error'}`);
    }
  };

  const handleRecordToggle = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  return (
    <div className="flex items-center flex-col">
      <div className="flex items-center mb-2">
        <button
          onClick={handleRecordToggle}
          className={`p-2 rounded-full ${
            isRecording ? 'bg-red-600' : 'bg-purple-600'
          } mr-2`}
        >
          <Mic size={24} />
        </button>
        <canvas ref={canvasRef} width="200" height="50" className="bg-gray-900 rounded" />
      </div>
      {error && (
        <p className="text-red-500 text-sm mt-2">{error}</p>
      )}
    </div>
  );
};

export default VoiceRecorder;
