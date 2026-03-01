import { useState, useRef } from 'react';

export default function useVoiceInput() {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const recognitionRef = useRef<any>(null);
  // This ref stores the "final" text so it doesn't get deleted during pauses
  const fullTranscriptRef = useRef('');

  const startListening = (langCode: string = 'hi-IN') => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    recognitionRef.current = new SpeechRecognition();
    recognitionRef.current.lang = langCode;
    recognitionRef.current.continuous = true;
    recognitionRef.current.interimResults = true;

    fullTranscriptRef.current = ''; // Reset for a new recording
    setTranscript('');

    recognitionRef.current.onresult = (event: any) => {
      let interimTranscript = '';
      let finalForThisResult = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const text = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalForThisResult += text + ' ';
        } else {
          interimTranscript += text;
        }
      }

      // Add the latest final text to our permanent storage
      fullTranscriptRef.current += finalForThisResult;
      
      // Update UI with everything we've heard so far
      setTranscript(fullTranscriptRef.current + interimTranscript);
    };

    recognitionRef.current.onend = () => {
      // Don't set isListening to false here yet, let the Home handle it
    };
    
    setIsListening(true);
    recognitionRef.current.start();
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsListening(false);
  };

  return { isListening, transcript, startListening, stopListening };
}