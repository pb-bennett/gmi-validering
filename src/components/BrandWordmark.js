import Image from 'next/image';

const APP_INFO_SCALE = 4 / 3;

export default function BrandWordmark({ large = false, appInfo = false }) {
  const useLargeProportions = large || appInfo;

  return (
    <div className={`flex min-w-0 items-center ${large && !appInfo ? 'justify-center' : ''}`}>
      <Image
        src="/brand/gmi-validator-logo.svg"
        alt=""
        aria-hidden="true"
        width={useLargeProportions ? 64 : 48}
        height={useLargeProportions ? 64 : 48}
        className="shrink-0"
        style={appInfo ? { width: 64 * APP_INFO_SCALE, height: 64 * APP_INFO_SCALE } : undefined}
      />
      <div className={appInfo ? 'min-w-0 text-center' : 'min-w-0'}>
        <h1
          aria-label="GMI Validator"
          className={`${useLargeProportions ? 'text-3xl' : 'text-[22.5px] leading-[27px]'} font-bold tracking-tight text-gmi-navy`}
          style={appInfo ? { fontSize: 30 * APP_INFO_SCALE, lineHeight: `${36 * APP_INFO_SCALE}px`, overflowWrap: 'anywhere' } : undefined}
        >
          <span aria-hidden="true">MI Validator</span>
        </h1>
        <span
          className={`block font-medium uppercase text-gmi-text-subtle ${useLargeProportions ? 'text-xs leading-tight tracking-wide' : 'text-[9px] leading-[11px] tracking-wide text-center'}`}
          style={appInfo ? { fontSize: 12 * APP_INFO_SCALE, lineHeight: `${15 * APP_INFO_SCALE}px`, overflowWrap: 'anywhere' } : undefined}
        >
          Innmålingskontroll
        </span>
      </div>
    </div>
  );
}
