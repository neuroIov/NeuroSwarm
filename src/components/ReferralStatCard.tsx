import React from "react";

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
  if (highlight) {
    // Total Referral Rewards card
    return (
      <div
        className={`
          relative rounded-2xl overflow-hidden flex flex-col justify-center 
          w-full min-w-[200px] sm:min-w-[300px] h-[120px] px-4 sm:px-6 
          transition-all duration-500 ease-out
          shadow-lg hover:shadow-blue-500/20 hover:shadow-2xl
          bg-gradient-to-r from-blue-600 to-blue-400
          hover:-translate-y-1
          group
          ${className}
        `}
        style={{
          backgroundImage: backgroundImage
            ? `url(${backgroundImage})`
            : undefined,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-r from-blue-600/10 to-blue-400/10 transition-opacity duration-300 group-hover:opacity-90" />

        {/* Shine effect */}
        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent transform -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
        </div>

        {/* Content */}
        <div className="relative z-20 flex flex-col items-start transform transition-transform duration-300 group-hover:translate-x-2">
          <div className="text-white/90 text-sm font-medium mb-2 transition-colors duration-300 group-hover:text-white">
            {label}
          </div>
          <div className="text-white text-3xl font-bold transition-all duration-300 group-hover:scale-105">
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
        group relative rounded-2xl overflow-hidden 
        w-full min-w-[200px] sm:min-w-[280px] h-[120px] 
        transition-all duration-500 ease-out
        shadow-lg hover:shadow-blue-500/20 hover:shadow-2xl
        bg-[#0A1B3D] hover:-translate-y-1
        ${className}
      `}
      style={{
        backgroundImage: backgroundImage
          ? `url(${backgroundImage})`
          : undefined,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundColor: "rgba(10, 27, 61, 0.3)", // Lighter base background
      }}
    >
      {/* Background overlay with hover effect */}
      <div className="absolute inset-0 bg-[#0A1B3D]/40 transition-opacity duration-300 group-hover:opacity-30" />

      {/* Shine effect */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent transform -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
      </div>

      {/* Content container */}
      <div className="relative z-20 h-full w-full p-6">
        {/* Icon in top-right corner with animation */}
        {icon && (
          <div className="absolute top-6 right-6 transform transition-transform duration-300 group-hover:scale-110 group-hover:-translate-y-1">
            <div className="bg-blue-500/90 rounded-full w-10 h-10 flex items-center justify-center transition-colors duration-300 group-hover:bg-blue-400">
              {icon}
            </div>
          </div>
        )}

        {/* Text content with animations */}
        <div className="flex flex-col h-full justify-center transform transition-transform duration-300 group-hover:translate-x-2">
          <div className="text-white text-3xl font-bold mb-2 transition-all duration-300 group-hover:scale-105">
            {value}
          </div>
          <div className="text-white/90 text-sm font-medium transition-colors duration-300 group-hover:text-white">
            {label}
          </div>
        </div>
      </div>

      {/* Glow effect on hover */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
        <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-transparent" />
      </div>
    </div>
  );
};
