/** Hero backdrop: light = soft grid + warm brand wash; dark = layered grid on navy */
function HeroBackdropLight() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden opacity-100 dark:hidden" aria-hidden>
      <svg
        className="absolute inset-0 h-full min-h-[100%] w-full"
        preserveAspectRatio="xMidYMid slice"
        viewBox="0 0 1600 900"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern id="hero-grid-light" width="48" height="48" patternUnits="userSpaceOnUse">
            <path d="M48 0H0V48" fill="none" stroke="#0B1F3A" strokeOpacity="0.055" strokeWidth="1" />
          </pattern>
          <pattern id="hero-fine-light" width="16" height="16" patternUnits="userSpaceOnUse">
            <path d="M16 0H0V16" fill="none" stroke="#0B1F3A" strokeOpacity="0.03" strokeWidth="0.4" />
          </pattern>
        </defs>
        {/* solid wash (no gradients on the site) */}
        <rect width="1600" height="900" fill="#F5F8FC" fillOpacity="0.6" />
        <rect width="1600" height="900" fill="url(#hero-grid-light)" />
        <rect width="1600" height="900" fill="url(#hero-fine-light)" />
        <path
          d="M -40 500 C 200 470 360 340 540 390 S 900 280 1140 320 S 1480 180 1680 150"
          fill="none"
          stroke="#E84A27"
          strokeOpacity="0.14"
          strokeWidth="2.25"
          strokeLinecap="round"
        />
        <path
          d="M -40 640 C 260 610 440 700 700 540 S 1060 460 1340 420 S 1560 500 1700 450"
          fill="none"
          stroke="#0B1F3A"
          strokeOpacity="0.07"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <g fill="#E84A27" fillOpacity="0.12">
          <circle cx="540" cy="390" r="3.5" />
          <circle cx="1140" cy="320" r="3.5" />
          <circle cx="700" cy="540" r="2.5" />
        </g>
      </svg>
    </div>
  );
}

function HeroBackdropDark() {
  return (
    <div className="pointer-events-none absolute inset-0 hidden overflow-hidden dark:block" aria-hidden>
      <svg
        className="absolute inset-0 h-full min-h-[100%] w-full"
        preserveAspectRatio="xMidYMid slice"
        viewBox="0 0 1600 900"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect width="1600" height="900" fill="#0B1F3A" />
        <defs>
          <pattern id="hero-grid" width="56" height="56" patternUnits="userSpaceOnUse">
            <path d="M56 0H0V56" fill="none" stroke="#ffffff" strokeOpacity="0.08" strokeWidth="1" />
          </pattern>
          <pattern id="hero-fine" width="14" height="14" patternUnits="userSpaceOnUse">
            <path d="M14 0H0V14" fill="none" stroke="#ffffff" strokeOpacity="0.05" strokeWidth="0.45" />
          </pattern>
          <pattern id="hero-diag" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M0 40 L40 0" fill="none" stroke="#E84A27" strokeOpacity="0.04" strokeWidth="0.6" />
          </pattern>
        </defs>
        <rect width="1600" height="900" fill="url(#hero-grid)" />
        <rect width="1600" height="900" fill="url(#hero-fine)" />
        <rect width="1600" height="900" fill="url(#hero-diag)" opacity="0.85" />
        <g stroke="#ffffff" strokeOpacity="0.04" strokeWidth="1">
          {[180, 360, 540, 720].map((y) => (
            <line key={y} x1="0" y1={y} x2="1600" y2={y} />
          ))}
        </g>
        <g stroke="#ffffff" strokeOpacity="0.055" strokeWidth="1">
          <line x1="320" y1="0" x2="320" y2="900" />
          <line x1="640" y1="0" x2="640" y2="900" />
          <line x1="960" y1="0" x2="960" y2="900" />
          <line x1="1280" y1="0" x2="1280" y2="900" />
        </g>
        <path
          d="M -40 480 C 180 460 320 320 520 380 S 880 260 1120 300 S 1480 140 1680 120"
          fill="none"
          stroke="#E84A27"
          strokeOpacity="0.12"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <path
          d="M -40 620 C 260 600 420 680 680 520 S 1040 440 1320 400 S 1540 480 1700 420"
          fill="none"
          stroke="#ffffff"
          strokeOpacity="0.07"
          strokeWidth="1.75"
          strokeLinecap="round"
        />
        <path
          d="M -40 360 L 120 340 280 400 440 280 600 320 780 200 960 260 1140 180 1320 220 1500 140 1680 100"
          fill="none"
          stroke="#E84A27"
          strokeOpacity="0.09"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path
          d="M -20 200 C 200 240 400 120 620 180 S 1000 80 1200 140 S 1450 60 1680 100"
          fill="none"
          stroke="#E84A27"
          strokeOpacity="0.06"
          strokeWidth="1.25"
          strokeLinecap="round"
        />
        <g fill="#E84A27" fillOpacity="0.12">
          <circle cx="440" cy="280" r="3.5" />
          <circle cx="780" cy="200" r="3.5" />
          <circle cx="1140" cy="180" r="3.5" />
          <circle cx="620" cy="420" r="2.5" />
          <circle cx="980" cy="340" r="2.5" />
        </g>
        <text
          x="1180"
          y="220"
          fill="#E84A27"
          fillOpacity="0.06"
          fontFamily="system-ui, sans-serif"
          fontSize="140"
          fontWeight="700"
        >
          %
        </text>
        <text
          x="80"
          y="780"
          fill="#ffffff"
          fillOpacity="0.045"
          fontFamily="system-ui, sans-serif"
          fontSize="200"
          fontWeight="600"
        >
          $
        </text>
        <text
          x="1320"
          y="760"
          fill="#E84A27"
          fillOpacity="0.05"
          fontFamily="system-ui, sans-serif"
          fontSize="90"
          fontWeight="600"
        >
          €
        </text>
      </svg>
      <div className="absolute -left-28 top-12 h-64 w-64 rounded-full bg-[#E84A27]/9 hidden" />
      <div className="absolute -right-24 bottom-8 h-72 w-72 rounded-full bg-[#E84A27]/8 hidden" />
      <div className="absolute bottom-0 left-1/3 h-px w-1/3 bg-[#E84A27]/15" />
    </div>
  );
}

export function HeroEconomicBackdrop() {
  return (
    <>
      <HeroBackdropLight />
      <HeroBackdropDark />
    </>
  );
}
