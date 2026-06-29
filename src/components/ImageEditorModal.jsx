import React, { useState, useRef, useEffect } from "react";
import ReactCrop, { centerCrop, makeAspectCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { X, Check, Undo2 } from "lucide-react";

function centerAspectCrop(mediaWidth, mediaHeight, aspect) {
  return centerCrop(
    makeAspectCrop(
      {
        unit: "%",
        width: 90,
      },
      aspect,
      mediaWidth,
      mediaHeight
    ),
    mediaWidth,
    mediaHeight
  );
}

export default function ImageEditorModal({ imageSrc, onComplete, onCancel }) {
  const [crop, setCrop] = useState();
  const [completedCrop, setCompletedCrop] = useState(null);
  
  // Image Modifications
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [saturation, setSaturation] = useState(100);

  const imgRef = useRef(null);

  const onImageLoad = (e) => {
    const { width, height } = e.currentTarget;
    // By default, just give a nice 90% centered crop without enforcing aspect ratio
    setCrop(centerAspectCrop(width, height, width / height));
  };

  const handleApply = async () => {
    if (!imgRef.current) return;
    
    // If user hasn't selected a crop, assume they want the whole image
    const finalCrop = completedCrop || {
      unit: "px",
      x: 0,
      y: 0,
      width: imgRef.current.width,
      height: imgRef.current.height,
    };

    const image = imgRef.current;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    if (!ctx) {
      alert("No 2d context");
      return;
    }

    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;
    
    // Pixel ratio for higher quality
    const pixelRatio = window.devicePixelRatio || 1;

    // We want to downscale large images automatically to keep email sizes small
    // Maximum allowed width: 800px (retina emails are 600-800px typically)
    const MAX_WIDTH = 800;
    
    // Target dimensions
    let targetWidth = finalCrop.width * scaleX;
    let targetHeight = finalCrop.height * scaleY;
    
    if (targetWidth > MAX_WIDTH) {
      const ratio = MAX_WIDTH / targetWidth;
      targetWidth = MAX_WIDTH;
      targetHeight = targetHeight * ratio;
    }

    canvas.width = targetWidth * pixelRatio;
    canvas.height = targetHeight * pixelRatio;
    
    ctx.scale(pixelRatio, pixelRatio);
    ctx.imageSmoothingQuality = "high";

    const cropX = finalCrop.x * scaleX;
    const cropY = finalCrop.y * scaleY;
    const cropWidth = finalCrop.width * scaleX;
    const cropHeight = finalCrop.height * scaleY;

    // To apply filters properly before cropping, we draw the whole image to an offscreen canvas
    const offscreen = document.createElement("canvas");
    offscreen.width = image.naturalWidth;
    offscreen.height = image.naturalHeight;
    const offCtx = offscreen.getContext("2d");
    
    // Apply filters to offscreen
    offCtx.filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`;
    offCtx.drawImage(image, 0, 0);

    // Now draw the cropped portion from the offscreen canvas to our final canvas
    ctx.drawImage(
      offscreen,
      cropX,
      cropY,
      cropWidth,
      cropHeight,
      0,
      0,
      targetWidth,
      targetHeight
    );

    // Export
    const base64Image = canvas.toDataURL("image/jpeg", 0.85); // 85% quality JPEG for small file size
    onComplete(base64Image);
  };

  const handleReset = () => {
    setBrightness(100);
    setContrast(100);
    setSaturation(100);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Edit Image</h2>
            <p className="text-sm text-slate-500 mt-0.5">Crop and adjust your image before inserting</p>
          </div>
          <button onClick={onCancel} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex flex-col lg:flex-row flex-1 min-h-0 bg-slate-50">
          
          {/* Main Cropper Area */}
          <div className="flex-1 flex items-center justify-center p-6 overflow-hidden bg-slate-100 relative min-h-[300px]">
            <ReactCrop
              crop={crop}
              onChange={(c) => setCrop(c)}
              onComplete={(c) => setCompletedCrop(c)}
              className="max-h-full max-w-full shadow-md bg-white rounded-lg overflow-hidden"
            >
              <img
                ref={imgRef}
                alt="Crop me"
                src={imageSrc}
                onLoad={onImageLoad}
                style={{ 
                  filter: `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`,
                  maxHeight: "60vh",
                  width: "auto",
                  display: "block"
                }}
              />
            </ReactCrop>
          </div>

          {/* Sidebar Controls */}
          <div className="w-full lg:w-80 border-l border-slate-200 bg-white flex flex-col shrink-0 overflow-y-auto">
            <div className="p-6 space-y-6">
              
              {/* Controls */}
              <div className="space-y-4">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Adjustments</h3>
                
                {/* Brightness */}
                <div className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <label className="font-semibold text-slate-700">Brightness</label>
                    <span className="text-slate-500">{brightness}%</span>
                  </div>
                  <input
                    type="range" min="0" max="200" value={brightness}
                    onChange={(e) => setBrightness(Number(e.target.value))}
                    className="w-full accent-dd-red"
                  />
                </div>

                {/* Contrast */}
                <div className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <label className="font-semibold text-slate-700">Contrast</label>
                    <span className="text-slate-500">{contrast}%</span>
                  </div>
                  <input
                    type="range" min="0" max="200" value={contrast}
                    onChange={(e) => setContrast(Number(e.target.value))}
                    className="w-full accent-dd-red"
                  />
                </div>

                {/* Saturation */}
                <div className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <label className="font-semibold text-slate-700">Saturation</label>
                    <span className="text-slate-500">{saturation}%</span>
                  </div>
                  <input
                    type="range" min="0" max="200" value={saturation}
                    onChange={(e) => setSaturation(Number(e.target.value))}
                    className="w-full accent-dd-red"
                  />
                </div>
              </div>

              <div className="pt-6 border-t border-slate-100">
                <button
                  onClick={handleReset}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition-colors text-sm"
                >
                  <Undo2 className="w-4 h-4" /> Reset Adjustments
                </button>
              </div>

            </div>

            {/* Footer Actions */}
            <div className="mt-auto p-6 border-t border-slate-200 bg-slate-50 flex gap-3">
              <button
                onClick={onCancel}
                className="flex-1 px-4 py-2.5 rounded-xl font-bold text-slate-600 bg-white border border-slate-300 hover:bg-slate-100 transition-colors shadow-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleApply}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-bold text-white bg-dd-red hover:bg-dd-red-dark transition-colors shadow-md"
              >
                <Check className="w-4 h-4" /> Apply
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
