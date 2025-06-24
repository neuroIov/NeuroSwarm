import React, { useEffect, useState } from "react";

interface ReferralStatCardProps {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  backgroundImage?: string;
  className?: string;
  highlight?: boolean;
}

export const ReferralStatCard: React.FC<ReferralStatCardProps> = ({
  label,
  value,
  icon,
  backgroundImage,
  className = "",
  highlight = false,
}) => {
  // Add state to track animation phases
  const [isAnimating, setIsAnimating] = useState(false);
  const [shineEffect, setShineEffect] = useState(false);

  // Set up animation intervals
  useEffect(() => {
    // Main animation cycle - every 4 seconds
    const animationInterval = setInterval(() => {
      setIsAnimating(true);
      
      // Reset animation after 2 seconds
      setTimeout(() => {
        setIsAnimating(false);
      }, 2000);
    }, 4000);

    // Shine effect - starts 500ms after main animation
    const shineInterval = setInterval(() => {
      setShineEffect(true);
      
      // Reset shine after 1.5 seconds
      setTimeout(() => {
        setShineEffect(false);
      }, 1500);
    }, 4000);

    // Delay the first animation by 1 second
    const initialTimeout = setTimeout(() => {
      setIsAnimating(true);
      setTimeout(() => {
        setShineEffect(true);
      }, 500);
    }, 1000);

    // Cleanup all intervals and timeouts
    return () => {
      clearInterval(animationInterval);
      clearInterval(shineInterval);
      clearTimeout(initialTimeout);
    };
  }, []);

  if (highlight) {
    // Total Referral Rewards card
    return (
      <div
        className={`
          relative rounded-2xl overflow-hidden flex flex-col justify-center 
          w-full min-w-[200px] sm:min-w-[300px] h-[120px] px-4 sm:px-6 
          transition-all duration-500 ease-out
          shadow-lg ${isAnimating ? 'shadow-blue-500/20 shadow-2xl' : ''}
          bg-gradient-to-r from-blue-600 to-blue-400
          ${isAnimating ? '-translate-y-1' : ''}
          ${className}
        `}
        style={{
          backgroundImage: backgroundImage
            ? `url(${backgroundImage})`
            : undefined,
          backgroundSize: "cover",
          backgroundPosition: "center",
          transition: "all 1s ease-in-out",
        }}
      >
        {/* Gradient overlay */}
        <div 
          className={`absolute inset-0 bg-gradient-to-r from-blue-600/10 to-blue-400/10 transition-opacity duration-500 ${isAnimating ? 'opacity-90' : 'opacity-10'}`} 
        />

        {/* Shine effect */}
        <div className={`absolute inset-0 transition-opacity duration-300 ${isAnimating ? 'opacity-100' : 'opacity-0'}`}>
          <div 
            className={`absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent transition-transform duration-1000 ${shineEffect ? 'translate-x-full' : '-translate-x-full'}`} 
          />
        </div>

        {/* Content */}
        <div className={`relative z-20 flex flex-col items-start transform transition-transform duration-500 ${isAnimating ? 'translate-x-2' : ''}`}>
          <div className={`text-sm font-medium mb-2 transition-colors duration-500 ${isAnimating ? 'text-white' : 'text-white/90'}`}>
            {label}
          </div>
          <div className={`text-white text-3xl font-bold transition-all duration-500 ${isAnimating ? 'scale-105' : ''}`}>
            {value}
          </div>
        </div>
      </div>
    );
  }

  // Tier cards
  return (
    <div
      className={`
        relative rounded-2xl overflow-hidden 
        w-full min-w-[200px] sm:min-w-[280px] h-[120px] 
        transition-all duration-500 ease-out
        shadow-lg ${isAnimating ? 'shadow-blue-500/20 shadow-2xl' : ''}
        bg-[#0A1B3D] ${isAnimating ? '-translate-y-1' : ''}
        ${className}
      `}
      style={{
        backgroundImage: backgroundImage
          ? `url(${backgroundImage})`
          : undefined,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundColor: "rgba(10, 27, 61, 0.3)", // Lighter base background
        transition: "all 1s ease-in-out",
      }}
    >
      {/* Background overlay with animation effect */}
      <div 
        className={`absolute inset-0 bg-[#0A1B3D]/40 transition-opacity duration-500 ${isAnimating ? 'opacity-30' : 'opacity-100'}`} 
      />

      {/* Shine effect */}
      <div className={`absolute inset-0 transition-opacity duration-300 ${isAnimating ? 'opacity-100' : 'opacity-0'}`}>
        <div 
          className={`absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent transition-transform duration-1000 ${shineEffect ? 'translate-x-full' : '-translate-x-full'}`} 
        />
      </div>

      {/* Content container */}
      <div className="relative z-20 h-full w-full p-6">
        {/* Icon in top-right corner with animation */}
        {icon && (
          <div className={`absolute top-6 right-6 transform transition-transform duration-500 ${isAnimating ? 'scale-110 -translate-y-1' : ''}`}>
            <div className={`rounded-full w-10 h-10 flex items-center justify-center transition-colors duration-500 ${isAnimating ? 'bg-blue-400' : 'bg-blue-500/90'}`}>
              {icon}
            </div>
          </div>
        )}

        {/* Text content with animations */}
        <div className={`flex flex-col h-full justify-center transform transition-transform duration-500 ${isAnimating ? 'translate-x-2' : ''}`}>
          <div className={`text-white text-3xl font-bold mb-2 transition-all duration-500 ${isAnimating ? 'scale-105' : ''}`}>
            {value}
          </div>
          <div className={`transition-colors duration-500 text-sm font-medium ${isAnimating ? 'text-white' : 'text-white/90'}`}>
            {label}
          </div>
        </div>
      </div>

      {/* Glow effect on animation */}
      <div className={`absolute inset-0 transition-opacity duration-500 ${isAnimating ? 'opacity-100' : 'opacity-0'}`}>
        <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-transparent" />
      </div>
    </div>
  );
};
