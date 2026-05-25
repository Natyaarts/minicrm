import React, { useRef, useState, useEffect } from 'react';
import { Camera, Check, X, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const FaceSelfieCapture = ({ onCapture, onCancel }) => {
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const [photo, setPhoto] = useState(null);
    const [stream, setStream] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        startCamera();
        return () => stopCamera();
    }, []);

    const startCamera = async () => {
        try {
            const mediaStream = await navigator.mediaDevices.getUserMedia({ 
                video: { facingMode: "user" },
                audio: false
            });
            setStream(mediaStream);
            if (videoRef.current) {
                videoRef.current.srcObject = mediaStream;
            }
        } catch (err) {
            setError("Could not access camera. Please allow camera permissions.");
        }
    };

    const stopCamera = () => {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
        }
    };

    const capturePhoto = () => {
        if (videoRef.current && canvasRef.current) {
            const video = videoRef.current;
            const canvas = canvasRef.current;
            
            // Set canvas dimensions to a reasonable size to prevent huge base64 strings
            const MAX_WIDTH = 640;
            let width = video.videoWidth;
            let height = video.videoHeight;
            
            if (width > MAX_WIDTH) {
                height = Math.round((height * MAX_WIDTH) / width);
                width = MAX_WIDTH;
            }

            canvas.width = width;
            canvas.height = height;
            
            // Draw image
            const ctx = canvas.getContext('2d');
            
            // Mirror image correctly
            ctx.translate(canvas.width, 0);
            ctx.scale(-1, 1);
            
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            
            // Lower quality to 0.6 for smaller payload
            const imageData = canvas.toDataURL('image/jpeg', 0.6);
            setPhoto(imageData);
            stopCamera();
        }
    };

    const retakePhoto = () => {
        setPhoto(null);
        startCamera();
    };

    const confirmPhoto = () => {
        if (photo) {
            onCapture(photo);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl"
            >
                <div className="p-4 border-b border-slate-800 flex justify-between items-center">
                    <h3 className="text-white font-bold text-lg">Selfie Clock In</h3>
                    <button onClick={() => { stopCamera(); onCancel(); }} className="text-slate-400 hover:text-white transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-4 flex flex-col items-center">
                    {error ? (
                        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm text-center mb-4 w-full">
                            {error}
                        </div>
                    ) : (
                        <div className="relative w-full aspect-[4/3] bg-black rounded-xl overflow-hidden mb-6 border border-slate-800 flex items-center justify-center">
                            {!photo ? (
                                <video 
                                    ref={videoRef} 
                                    autoPlay 
                                    playsInline 
                                    muted 
                                    className="w-full h-full object-cover transform scale-x-[-1]"
                                ></video>
                            ) : (
                                <img src={photo} alt="Captured selfie" className="w-full h-full object-cover" />
                            )}
                            
                            {/* Face outline guide overlay */}
                            {!photo && !error && (
                                <div className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-30">
                                    <div className="w-48 h-64 border-2 border-dashed border-white rounded-[50%]"></div>
                                </div>
                            )}
                        </div>
                    )}
                    
                    <canvas ref={canvasRef} className="hidden" />

                    {!error && (
                        <div className="w-full flex justify-center gap-4">
                            {!photo ? (
                                <button 
                                    onClick={capturePhoto}
                                    className="w-16 h-16 bg-indigo-600 rounded-full flex items-center justify-center border-4 border-indigo-900 shadow-[0_0_20px_rgba(79,70,229,0.5)] hover:bg-indigo-500 hover:scale-105 transition-all"
                                >
                                    <Camera className="text-white" size={24} />
                                </button>
                            ) : (
                                <>
                                    <button 
                                        onClick={retakePhoto}
                                        className="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl flex items-center gap-2 transition-colors"
                                    >
                                        <RefreshCw size={18} /> Retake
                                    </button>
                                    <button 
                                        onClick={confirmPhoto}
                                        className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl flex items-center gap-2 shadow-[0_0_20px_rgba(16,185,129,0.4)] transition-colors"
                                    >
                                        <Check size={18} /> Confirm
                                    </button>
                                </>
                            )}
                        </div>
                    )}
                </div>
                
                <div className="p-4 bg-slate-800/50 text-center border-t border-slate-800">
                    <p className="text-xs text-slate-400 font-medium">Please ensure your face is clearly visible inside the frame.</p>
                </div>
            </motion.div>
        </div>
    );
};

export default FaceSelfieCapture;
