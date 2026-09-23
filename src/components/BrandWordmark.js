import Image from 'next/image';

export default function BrandWordmark({ large = false }) {
  return (
    <div className={`flex min-w-0 items-center ${large ? 'justify-center' : ''}`}>
      <Image
        src="/brand/gmi-validator-logo.svg"
        alt=""
        aria-hidden="true"
        width={large ? 64 : 48}
        height={large ? 64 : 48}
        className="shrink-0"
      />
      <div className="min-w-0">
        <h1
          aria-label="GMI Validator"
          className={`${large ? 'text-3xl' : 'text-[22.5px] leading-[27px]'} font-bold tracking-tight text-gmi-navy`}
        >
          <span aria-hidden="true">MI Validator</span>
        </h1>
        <span className={`block font-medium uppercase text-gmi-text-subtle ${large ? 'text-xs leading-tight tracking-wide' : 'text-[9px] leading-[11px] tracking-wide text-center'}`}>
          Innmålingskontroll
        </span>
      </div>
    </div>
  );
}
