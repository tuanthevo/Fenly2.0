import React from 'react';
import { useFlag } from '../config/FlagsProvider';

export interface WrenMascotProps {
  size?: 'xs' | 'sm' | 'md' | 'lg';
  mood?: 'idle' | 'thinking' | 'flutter';
  className?: string;
}

/**
 * Wren — Visual Mascot & AI Assistant for Wren Rental
 * A plump, minimalist terracotta-and-cream little bird wearing a tiny brass hotel bellhop cap
 * on her head and carrying a vintage brass key in her beak.
 */
const WrenMascotArt: React.FC<WrenMascotProps> = ({
  size = 'md',
  mood = 'idle',
  className = '',
}) => {
  const dimensions = {
    xs: 'w-5 h-5',
    sm: 'w-7 h-7',
    md: 'w-9 h-9',
    lg: 'w-12 h-12',
  }[size];

  const animationClass =
    mood === 'thinking'
      ? 'animate-wren-thinking'
      : mood === 'flutter'
      ? 'animate-wren-flutter'
      : 'animate-wren-idle';

  return (
    <div
      className={`inline-flex items-center justify-center select-none shrink-0 ${dimensions} ${animationClass} ${className}`}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full drop-shadow-xs"
      >
        {/* Tail Feather (Terracotta) */}
        <path
          d="M11 38 L4 28 C4 28 9 25 14 31 Z"
          fill="#B85B3F"
          stroke="#2C2724"
          strokeWidth="2"
          strokeLinejoin="round"
        />

        {/* Plump Minimalist Bird Body (Warm Terracotta #D06C4E) */}
        <ellipse
          cx="31"
          cy="37"
          rx="18"
          ry="16"
          fill="#D06C4E"
          stroke="#2C2724"
          strokeWidth="2.2"
        />

        {/* Warm Cream / Oatmeal Belly Patch (#F9F7F3) */}
        <path
          d="M21 38 C21 30 41 30 41 38 C41 47 36 51 31 51 C26 51 21 47 21 38 Z"
          fill="#F9F7F3"
        />

        {/* Subtle Feather Scallops on Cream Belly */}
        <path
          d="M26 41 Q28.5 43 31 41 Q33.5 43 36 41"
          stroke="#D06C4E"
          strokeWidth="1.6"
          strokeLinecap="round"
          fill="none"
        />

        {/* Left Wing (Flutters up when celebrating) */}
        <path
          d={
            mood === 'flutter'
              ? 'M18 33 C10 22 14 16 22 25'
              : 'M20 34 C14 36 15 44 23 43'
          }
          fill="#B85B3F"
          stroke="#2C2724"
          strokeWidth="2"
          strokeLinecap="round"
        />

        {/* Friendly Expressive Eyes (Espresso #2C2724 with warm catchlight) */}
        <circle cx="26" cy="30" r="2.6" fill="#2C2724" />
        <circle cx="25.2" cy="29.2" r="0.9" fill="#F9F7F3" />

        <circle cx="38" cy="30" r="2.6" fill="#2C2724" />
        <circle cx="37.2" cy="29.2" r="0.9" fill="#F9F7F3" />

        {/* Rosy Warm Cheeks */}
        <ellipse cx="22.5" cy="33" rx="2.2" ry="1.3" fill="#E59882" />
        <ellipse cx="41" cy="33" rx="2.2" ry="1.3" fill="#E59882" />

        {/* Little Beak (Golden Brass #D4A359) */}
        <path
          d="M44 30 L53 32.5 L44 35 Z"
          fill="#D4A359"
          stroke="#2C2724"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />

        {/* Signature Accessory 1: Tiny Brass Hotel Bellhop Cap on Her Head */}
        <g transform="rotate(-6 31 18)">
          {/* Cap Pillbox Crown */}
          <rect
            x="22"
            y="11"
            width="18"
            height="9"
            rx="3"
            fill="#C89D54"
            stroke="#2C2724"
            strokeWidth="2"
          />
          {/* Cap Brass Trim Band */}
          <line
            x1="22"
            y1="17"
            x2="40"
            y2="17"
            stroke="#2C2724"
            strokeWidth="1.6"
          />
          {/* Tiny Brass Button on Top of Bellhop Cap */}
          <circle
            cx="31"
            cy="10"
            r="1.8"
            fill="#F4D078"
            stroke="#2C2724"
            strokeWidth="1.4"
          />
          {/* Chin / Cap Emblem */}
          <circle cx="31" cy="14.2" r="1.3" fill="#F9F7F3" />
        </g>

        {/* Signature Accessory 2: Vintage Brass Key Carried in Her Beak */}
        <g transform="translate(50, 32) rotate(14)">
          {/* Key Bow (Handle Ring) */}
          <circle
            cx="2"
            cy="2"
            r="2.8"
            fill="#F4D078"
            stroke="#2C2724"
            strokeWidth="1.5"
          />
          {/* Key Shaft */}
          <line
            x1="2"
            y1="4.8"
            x2="2"
            y2="12.5"
            stroke="#2C2724"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <line
            x1="2"
            y1="4.8"
            x2="2"
            y2="12"
            stroke="#F4D078"
            strokeWidth="1"
            strokeLinecap="round"
          />
          {/* Key Teeth */}
          <line
            x1="2"
            y1="9.5"
            x2="5"
            y2="9.5"
            stroke="#2C2724"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <line
            x1="2"
            y1="12"
            x2="5.5"
            y2="12"
            stroke="#2C2724"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </g>

        {/* Little Bird Feet */}
        <path
          d="M26 53 L24 57 M26 53 L27 57"
          stroke="#2C2724"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M36 53 L35 57 M36 53 L38 57"
          stroke="#2C2724"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
};

/** Wren mascot art. Hidden unless the `mascots` flag is on (Fenly 2.0: hide, don't delete). */
export const WrenMascot: React.FC<WrenMascotProps> = (props) =>
  useFlag('mascots') ? <WrenMascotArt {...props} /> : null;
