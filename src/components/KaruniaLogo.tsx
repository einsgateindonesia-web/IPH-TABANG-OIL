export function KaruniaLogo({ className = '' }: { className?: string }) {
  return (
    <div
      className={`inline-flex flex-col items-center justify-center select-none ${className}`}
      aria-label="Karunia Armada Indonesia"
    >
      <svg
        viewBox="0 0 340 106"
        className="w-[245px] h-[76px] print:w-[225px] print:h-[70px]"
        role="img"
        aria-label="Logo Karunia Armada Indonesia"
      >
        <defs>
          <linearGradient id="karuniaArcGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#84cc16" />
            <stop offset="55%" stopColor="#16a34a" />
            <stop offset="100%" stopColor="#0f7a2c" />
          </linearGradient>
        </defs>

        {/* Main KARUNIA Wordmark */}
        <text
          x="170"
          y="48"
          textAnchor="middle"
          fill="#108d32"
          fontFamily="'Plus Jakarta Sans', Arial, sans-serif"
          fontWeight="800"
          fontSize="50"
          letterSpacing="2.5"
        >
          KARUNIA
        </text>

        {/* Curved Green Swoosh Arc */}
        <path
          d="M 16 70 Q 170 50 326 67 Q 170 59 16 72 Z"
          fill="url(#karuniaArcGrad)"
        />
        <path
          d="M 28 73 Q 174 55 322 71 Q 174 62 28 73 Z"
          fill="#15803d"
          opacity="0.7"
        />

        {/* Armada Indonesia Subtitle */}
        <text
          x="320"
          y="96"
          textAnchor="end"
          fill="#168036"
          fontFamily="'Plus Jakarta Sans', Arial, sans-serif"
          fontWeight="600"
          fontSize="16.5"
          letterSpacing="0.4"
        >
          Armada Indonesia
        </text>
      </svg>
    </div>
  );
}
