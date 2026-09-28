export function PlatformDesktopFrame({ src, alt, title }: { src: string; alt: string; title: string }) {
  return (
    <figure className="w-full">
      <div className="overflow-hidden rounded-t-xl border-[5px] border-b-0 border-[#183642] bg-white shadow-[0_24px_60px_-20px_rgba(16,43,54,.3)]">
        <div className="flex h-7 items-center gap-1.5 border-b border-white/10 bg-[#183642] px-3" aria-hidden="true">
          <span className="h-1.5 w-1.5 rounded-full bg-[#F4B4CD]" />
          <span className="h-1.5 w-1.5 rounded-full bg-[#EFD49B]" />
          <span className="h-1.5 w-1.5 rounded-full bg-[#9DD6E8]" />
          <span className="mx-auto rounded bg-white/10 px-5 text-[9px] tracking-wide text-white/75">AIO Fusion platform</span>
        </div>
        <img src={src} alt={alt} loading="lazy" className="block w-full h-auto" />
      </div>
      <div className="h-3 rounded-b-[50%] border border-t-0 border-[#183642]/30 bg-gradient-to-b from-[#D6E1E3] to-[#B9C9CC]" aria-hidden="true" />
      <figcaption className="mt-2 text-center text-[11px] font-medium text-[#475569]">
        {title} · Illustrative platform view
      </figcaption>
    </figure>
  );
}